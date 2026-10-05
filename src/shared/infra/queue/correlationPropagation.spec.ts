/// <reference types="vitest/globals" />

/**
 * B21 — ponta a ponta: request → enqueue → outbox (payload criptografado)
 * → dispatcher → job. Prova que o mesmo correlationId atravessa todas as
 * fronteiras e que nenhum contexto vaza para fora do request.
 */

const mockQueueAdd = vi.fn();
const mockOutboxFindMany = vi.fn();
const mockPrismaCreate = vi.fn();
const mockPrismaFindUnique = vi.fn();
const mockPrismaSuppression = vi.fn();

vi.mock("bullmq", () => ({
  Queue: class {
    add(...argumentos: unknown[]) {
      return mockQueueAdd(...argumentos);
    }
  },
  QueueEvents: class {},
}));

vi.mock("./redisConnection", () => ({
  getRedisConnection: () => ({}),
}));

vi.mock("./emailWorker", () => ({
  ensureEmailWorker: vi.fn(),
}));

vi.mock("@/libs/prismaClient", () => ({
  prisma: {
    notificationDelivery: {
      findUnique: (...argumentos: unknown[]) =>
        mockPrismaFindUnique(...argumentos),
      create: (...argumentos: unknown[]) => mockPrismaCreate(...argumentos),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    notificationSuppression: {
      findFirst: (...argumentos: unknown[]) =>
        mockPrismaSuppression(...argumentos),
    },
    notificationPreference: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    notificationOutbox: {
      findMany: (...argumentos: unknown[]) => mockOutboxFindMany(...argumentos),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("./notificationQueue", () => ({
  getNotificationQueue: () => ({ add: (...a: unknown[]) => mockQueueAdd(...a) }),
}));

import fastify from "fastify";
import { correlationIdMiddleware } from "@/shared/infra/http/middlewares/correlationId";
import { enqueueEmail } from "./emailQueue";
import { dispatchNotificationOutboxNow } from "./notificationDispatcher";
import {
  decryptNotificationPayload,
} from "@/modules/notifications/services/notificationSecurity";
import {
  getCorrelationId,
  resolveCorrelationId,
  runWithCorrelationId,
} from "@/shared/utils/correlationContext";

const CORRELACAO = "req-propagacao-001";

let outboxCriado: any = null;

function candidato(
  outbox: {
    payloadCiphertext?: string;
    payloadIv?: string;
    payloadTag?: string;
    keyVersion?: string;
  } | null,
  id: string,
) {
  return {
    id: `o-${id}`,
    deliveryId: `d-${id}`,
    publishAttempts: 0,
    delivery: { status: "PENDING" },
    ...(outbox
      ? {
          payloadCiphertext: outbox.payloadCiphertext,
          payloadIv: outbox.payloadIv,
          payloadTag: outbox.payloadTag,
          keyVersion: outbox.keyVersion,
        }
      : {}),
  };
}

describe("B21 — correlação request → outbox → dispatcher → job", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NOTIFICATION_V2_MODE", "active");
    vi.stubEnv("VITEST", "");
    outboxCriado = null;
    mockPrismaFindUnique.mockResolvedValue(null);
    mockPrismaSuppression.mockResolvedValue(null);
    mockPrismaCreate.mockImplementation(async (argumentos: any) => {
      outboxCriado = argumentos;
      return { id: "d-1" };
    });
    mockOutboxFindMany.mockResolvedValue([]);
    mockQueueAdd.mockResolvedValue({});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function montarApp() {
    const app = fastify({ logger: false });
    app.addHook("onRequest", correlationIdMiddleware);
    return app;
  }

  it("request → enqueue → outbox → job carregam o mesmo correlationId", async () => {
    const app = await montarApp();
    let idNoHandler: string | undefined;

    app.post("/enqueue", async () => {
      idNoHandler = getCorrelationId();
      await enqueueEmail({
        kind: "password_changed",
        ownerName: "Dono",
        email: "dono@salao.com",
        deduplicationKey: "dk-prop-1",
      });
      return { ok: true };
    });

    const resposta = await app.inject({
      method: "POST",
      url: "/enqueue",
      headers: { "x-correlation-id": CORRELACAO },
    });
    expect(resposta.statusCode).toBe(200);
    expect(resposta.headers["x-correlation-id"]).toBe(CORRELACAO);
    expect(idNoHandler).toBe(CORRELACAO);

    // O payload criptografado persistido no outbox guarda o correlationId.
    expect(outboxCriado).toBeTruthy();
    const outbox = outboxCriado.data.outbox.create;
    const payload = decryptNotificationPayload<Record<string, unknown>>({
      ciphertext: outbox.payloadCiphertext,
      iv: outbox.payloadIv,
      tag: outbox.payloadTag,
      keyVersion: outbox.keyVersion,
    });
    expect(payload.correlationId).toBe(CORRELACAO);

    // Dispatcher roda FORA do contexto do request e religa o job à origem.
    mockOutboxFindMany.mockResolvedValue([candidato(outbox, "1")]);
    await dispatchNotificationOutboxNow();

    expect(mockQueueAdd).toHaveBeenCalledWith(
      "deliver",
      { deliveryId: "d-1", correlationId: CORRELACAO },
      { jobId: "d-1" },
    );
    expect(getCorrelationId()).toBeUndefined();
    await app.close();
  });

  it("outbox sem payload utilizável ganha correlationId autônomo no job", async () => {
    mockOutboxFindMany.mockResolvedValue([candidato(null, "2")]);

    await dispatchNotificationOutboxNow();

    const chamada = mockQueueAdd.mock.calls.at(-1) as [
      string,
      { deliveryId: string; correlationId: string },
      { jobId: string },
    ];
    expect(chamada[1].correlationId).toMatch(/^outbox-dispatch:/);
    expect(getCorrelationId()).toBeUndefined();
  });

  it("dispatcher herda o contexto do caller (ex.: cron) quando o outbox não tem payload", async () => {
    mockOutboxFindMany.mockResolvedValue([candidato(null, "3")]);

    await runWithCorrelationId("herdado-cron-99", () =>
      dispatchNotificationOutboxNow(),
    );

    const chamada = mockQueueAdd.mock.calls.at(-1) as [
      string,
      { deliveryId: string; correlationId: string },
      { jobId: string },
    ];
    expect(chamada[1].correlationId).toBe("herdado-cron-99");
  });

  it("sem header, o genReqId gera um id e o middleware espelha no reply", async () => {
    const app = fastify({
      logger: false,
      requestIdHeader: false,
      genReqId: (requisicao) =>
        resolveCorrelationId(requisicao.headers["x-correlation-id"]),
    });
    app.addHook("onRequest", correlationIdMiddleware);

    let idNoHandler: string | undefined;
    app.get("/sem-header", async (requisicao) => {
      idNoHandler = getCorrelationId();
      return { id: requisicao.id };
    });

    const resposta = await app.inject({ method: "GET", url: "/sem-header" });
    const idResposta = resposta.headers["x-correlation-id"];
    expect(typeof idResposta).toBe("string");
    expect(idResposta).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(idNoHandler).toBe(idResposta);
    await app.close();
  });

  it("requests consecutivas não vazam correlationId entre si", async () => {
    const app = await montarApp();
    const vistos: Array<string | undefined> = [];

    app.get("/ping", async () => {
      vistos.push(getCorrelationId());
      return { ok: true };
    });

    await app.inject({
      method: "GET",
      url: "/ping",
      headers: { "x-correlation-id": "primeira-req-01" },
    });
    await app.inject({
      method: "GET",
      url: "/ping",
      headers: { "x-correlation-id": "segunda-req-02" },
    });

    expect(vistos).toEqual(["primeira-req-01", "segunda-req-02"]);
    expect(getCorrelationId()).toBeUndefined();
    await app.close();
  });
});
