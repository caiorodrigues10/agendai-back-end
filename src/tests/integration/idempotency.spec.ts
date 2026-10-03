/// <reference types="vitest/globals" />
/**
 * Idempotência pelos caminhos REAIS (Postgres + Redis).
 *
 * O ramo de memória usado nos testes unitários não exercita o claim durável,
 * o replay nem os estados UNCERTAIN/FAILED — por isso existe este arquivo.
 *
 * Requer Postgres do docker-compose (5442) + Redis (6379), conforme
 * `npm run test:integration`.
 */
import { createHash } from "node:crypto";
import { AppError } from "@/shared/errors/AppError";
import { executeIdempotent, resetIdempotencyMemoryForTests } from "@/shared/services/idempotencyService";
import { prisma } from "@/libs/prismaClient";

type FakeRequest = {
  headers: Record<string, string>;
  user?: { id: string };
  ip: string;
  correlationId: string;
  body: unknown;
  idempotencyKey?: string;
};

function request(key: string, body: unknown, owner = "owner-1"): FakeRequest {
  return {
    headers: { "idempotency-key": key },
    user: { id: owner },
    ip: "127.0.0.1",
    correlationId: `corr-${Date.now()}-${Math.random()}`,
    body,
  };
}

const REAL_PATH_KEY = "IDEMPOTENCY_REAL_PATH";

/**
 * Espelha `storageKey()` do serviço: a coluna `idempotencyKey` guarda o hash
 * (`agendai:idempotency:<sha256(scope:owner:key)>`), não a chave do header.
 */
function dbKey(scope: string, key: string, owner = "owner-1"): string {
  return `agendai:idempotency:${createHash("sha256").update(`${scope}:${owner}:${key}`).digest("hex")}`;
}

describe("idempotency (real path: Postgres + Redis)", () => {
  const created: string[] = [];
  let previousFlag: string | undefined;

  function track(scope: string, key: string) {
    created.push(dbKey(scope, key));
  }

  beforeAll(() => {
    previousFlag = process.env[REAL_PATH_KEY];
    process.env[REAL_PATH_KEY] = "1";
    resetIdempotencyMemoryForTests();
  });

  afterAll(async () => {
    if (previousFlag === undefined) delete process.env[REAL_PATH_KEY];
    else process.env[REAL_PATH_KEY] = previousFlag;
    resetIdempotencyMemoryForTests();
    if (created.length > 0) {
      await prisma.idempotencyRecord
        .deleteMany({ where: { idempotencyKey: { in: created } } })
        .catch(() => undefined);
    }
  });

  it("executa uma vez e faz replay a partir do registro durável", async () => {
    const key = `real-path-replay-${Date.now()}`.padEnd(20, "0");
    const scope = `test:${key}`;
    track(scope, key);
    const operation = vi.fn().mockResolvedValue({ invoiceId: "inv-1" });

    const first = await executeIdempotent(request(key, { amount: 10 }) as never, scope, operation);
    const replay = await executeIdempotent(request(key, { amount: 10 }) as never, scope, operation);

    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.data).toEqual({ invoiceId: "inv-1" });
    expect(operation).toHaveBeenCalledTimes(1);

    const record = await prisma.idempotencyRecord.findUnique({
      where: { scope_idempotencyKey: { scope, idempotencyKey: dbKey(scope, key) } },
    });
    expect(record?.status).toBe("SUCCEEDED");
    expect(record?.requestFingerprint).toHaveLength(64);
  });

  it("mesma chave com payload diferente falha em todos os caminhos", async () => {
    const key = `real-path-mismatch-${Date.now()}`.padEnd(20, "0");
    const scope = `test:${key}`;
    track(scope, key);
    const operation = vi.fn().mockResolvedValue({ ok: true });

    await executeIdempotent(request(key, { amount: 10 }) as never, scope, operation);

    await expect(
      executeIdempotent(request(key, { amount: 999 }) as never, scope, operation),
    ).rejects.toMatchObject({ statusCode: 409, code: "IDEMPOTENCY_PAYLOAD_MISMATCH" });
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("falha definitiva (AppError) permite nova tentativa com a mesma chave", async () => {
    const key = `real-path-apperror-${Date.now()}`.padEnd(20, "0");
    const scope = `test:${key}`;
    track(scope, key);

    await expect(
      executeIdempotent(
        request(key, { amount: 10 }) as never,
        scope,
        vi.fn().mockRejectedValue(new AppError("Saldo insuficiente", 422, undefined, "SALDO_INSUFICIENTE")),
      ),
    ).rejects.toMatchObject({ statusCode: 422 });

    const record = await prisma.idempotencyRecord.findUnique({
      where: { scope_idempotencyKey: { scope, idempotencyKey: dbKey(scope, key) } },
    });
    expect(record?.status).toBe("FAILED");

    const retry = vi.fn().mockResolvedValue({ invoiceId: "inv-2" });
    const result = await executeIdempotent(request(key, { amount: 10 }) as never, scope, retry);
    expect(result.replayed).toBe(false);
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("resultado incerto (erro não-AppError) não autoriza repetir a operação", async () => {
    const key = `real-path-uncertain-${Date.now()}`.padEnd(20, "0");
    const scope = `test:${key}`;
    track(scope, key);

    await expect(
      executeIdempotent(
        request(key, { amount: 10 }) as never,
        scope,
        vi.fn().mockRejectedValue(new Error("timeout do provedor")),
      ),
    ).rejects.toBeInstanceOf(Error);

    const record = await prisma.idempotencyRecord.findUnique({
      where: { scope_idempotencyKey: { scope, idempotencyKey: dbKey(scope, key) } },
    });
    expect(record?.status).toBe("UNCERTAIN");

    const retry = vi.fn().mockResolvedValue({ invoiceId: "nao-deve-roda" });
    await expect(
      executeIdempotent(request(key, { amount: 10 }) as never, scope, retry),
    ).rejects.toMatchObject({ statusCode: 409, code: "IDEMPOTENCY_RESULT_UNCERTAIN" });
    expect(retry).not.toHaveBeenCalled();
  });

  it("requisições concorrentes com a mesma chave executam a operação uma única vez", async () => {
    const key = `real-path-concurrent-${Date.now()}`.padEnd(20, "0");
    const scope = `test:${key}`;
    track(scope, key);

    let executions = 0;
    const operation = async () => {
      executions += 1;
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { executions };
    };

    const results = await Promise.allSettled([
      executeIdempotent(request(key, { amount: 10 }) as never, scope, operation),
      executeIdempotent(request(key, { amount: 10 }) as never, scope, operation),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(executions).toBe(1);
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);
    const rejected = results.find((r) => r.status === "rejected");
    if (rejected) {
      expect((rejected as PromiseRejectedResult).reason).toMatchObject({
        statusCode: 409,
        code: "IDEMPOTENCY_IN_PROGRESS",
      });
    }
  });
});
