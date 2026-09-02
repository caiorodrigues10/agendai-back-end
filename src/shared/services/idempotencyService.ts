import { createHash } from "node:crypto";
import { FastifyRequest } from "fastify";
import { AppError } from "@/shared/errors/AppError";
import { getRedisConnection } from "@/shared/infra/queue/redisConnection";
import { prisma } from "@/libs/prismaClient";

const memoryResults = new Map<string, unknown>();
const memoryLocks = new Set<string>();

export function requireIdempotencyKey(request: FastifyRequest): string {
  const raw = request.headers["idempotency-key"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string" || !/^[A-Za-z0-9._:-]{16,100}$/.test(value)) {
    throw new AppError(
      "Idempotency-Key é obrigatório para criar cobranças.",
      400,
      undefined,
      "IDEMPOTENCY_KEY_REQUIRED",
    );
  }
  request.idempotencyKey = value;
  return value;
}

function storageKey(scope: string, request: FastifyRequest): string {
  const owner = request.user?.id ?? request.ip;
  const digest = createHash("sha256")
    .update(`${scope}:${owner}:${request.idempotencyKey}`)
    .digest("hex");
  return `agendai:idempotency:${digest}`;
}

function requestFingerprint(request: FastifyRequest): string {
  return createHash("sha256")
    .update(JSON.stringify(request.body ?? null))
    .digest("hex");
}

async function executeWithDatabase<T>(
  request: FastifyRequest,
  scope: string,
  operation: () => Promise<T>,
): Promise<{ data: T; replayed: boolean }> {
  const key = request.idempotencyKey!;
  const fingerprint = requestFingerprint(request);
  const where = { scope_idempotencyKey: { scope, idempotencyKey: key } } as const;

  let record = await prisma.idempotencyRecord.findUnique({ where });
  if (record) {
    if (record.requestFingerprint !== fingerprint) {
      throw new AppError("A mesma Idempotency-Key foi usada com dados diferentes.", 409, undefined, "IDEMPOTENCY_PAYLOAD_MISMATCH");
    }
    if (record.status === "SUCCEEDED" && record.response !== null) {
      return { data: record.response as T, replayed: true };
    }
    if (record.status === "IN_PROGRESS") {
      throw new AppError("Cobrança em processamento. Aguarde alguns segundos.", 409, undefined, "IDEMPOTENCY_IN_PROGRESS");
    }
    await prisma.idempotencyRecord.update({
      where,
      data: { status: "IN_PROGRESS", response: null },
    });
  } else {
    try {
      record = await prisma.idempotencyRecord.create({
        data: { scope, idempotencyKey: key, requestFingerprint, status: "IN_PROGRESS" },
      });
    } catch (error: unknown) {
      if (!(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002")) {
        throw error;
      }
      record = await prisma.idempotencyRecord.findUniqueOrThrow({ where });
      if (record.requestFingerprint !== fingerprint || record.status === "IN_PROGRESS") {
        throw new AppError("Cobrança em processamento. Aguarde alguns segundos.", 409, undefined, "IDEMPOTENCY_IN_PROGRESS");
      }
    }
  }

  try {
    const data = await operation();
    await prisma.idempotencyRecord.update({
      where,
      data: { status: "SUCCEEDED", response: data as object },
    });
    return { data, replayed: false };
  } catch (error) {
    await prisma.idempotencyRecord.update({ where, data: { status: "FAILED", response: null } }).catch(() => undefined);
    throw error;
  }
}

export async function executeIdempotent<T>(
  request: FastifyRequest,
  scope: string,
  operation: () => Promise<T>,
): Promise<{ data: T; replayed: boolean }> {
  requireIdempotencyKey(request);
  const key = storageKey(scope, request);

  if (process.env.VITEST) {
    if (memoryResults.has(key)) return { data: memoryResults.get(key) as T, replayed: true };
    if (memoryLocks.has(key)) throw new AppError("Cobrança em processamento.", 409, undefined, "IDEMPOTENCY_IN_PROGRESS");
    memoryLocks.add(key);
    try {
      const data = await operation();
      memoryResults.set(key, data);
      return { data, replayed: false };
    } finally {
      memoryLocks.delete(key);
    }
  }

  try {
    const redis = getRedisConnection();
    const resultKey = `${key}:result`;
    const lockKey = `${key}:lock`;
    const cached = await redis.get(resultKey);
    if (cached) return { data: JSON.parse(cached) as T, replayed: true };

    const acquired = await redis.set(lockKey, request.correlationId, "EX", 120, "NX");
    if (!acquired) {
      throw new AppError("Cobrança em processamento. Aguarde alguns segundos.", 409, undefined, "IDEMPOTENCY_IN_PROGRESS");
    }

    try {
      const data = await operation();
      await redis.set(resultKey, JSON.stringify(data), "EX", 86_400);
      return { data, replayed: false };
    } finally {
      await redis.del(lockKey).catch(() => undefined);
    }
  } catch (error) {
    if (error instanceof AppError && error.code !== "IDEMPOTENCY_UNAVAILABLE") throw error;
    try {
      return await executeWithDatabase(request, scope, operation);
    } catch (databaseError) {
      if (databaseError instanceof AppError) throw databaseError;
      throw new AppError("Proteção contra cobrança duplicada indisponível.", 503, undefined, "IDEMPOTENCY_UNAVAILABLE");
    }
  }
}

export function resetIdempotencyMemoryForTests(): void {
  memoryResults.clear();
  memoryLocks.clear();
}
