import { beforeEach, describe, expect, it, vi } from "vitest";

const SHOP_ID = "11111111-1111-4111-8111-111111111111";
const DELIVERY_ID = "22222222-2222-4222-8222-222222222222";
const REASON = "motivo com pelo menos dez caracteres";

const mocks = vi.hoisted(() => {
  const tx = {
    barbershop: { updateMany: vi.fn() },
    ownerBotPreference: { upsert: vi.fn() },
    ownerBotLink: { updateMany: vi.fn() },
    auditLog: { create: vi.fn() },
    notificationDelivery: { update: vi.fn(), updateMany: vi.fn() },
    notificationOutbox: { update: vi.fn(), updateMany: vi.fn() },
  };
  const prisma = {
    barbershop: { findMany: vi.fn(), findUnique: vi.fn() },
    ownerBotPreference: { upsert: vi.fn() },
    notificationDelivery: { findUnique: vi.fn() },
    notificationSuppression: { findFirst: vi.fn() },
    notificationPreference: { findFirst: vi.fn() },
    notificationOutbox: { findUnique: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  };
  const queue = {
    getJobCounts: vi.fn(),
    getFailed: vi.fn(),
    getJob: vi.fn(),
    close: vi.fn(),
  };
  return { tx, prisma, queue };
});

vi.mock("@/libs/prismaClient", () => ({ prisma: mocks.prisma }));

vi.mock("@/shared/services/platformWhatsAppSettings", () => ({
  getPlatformWhatsAppSettings: vi.fn(),
  updatePlatformWhatsAppSettings: vi.fn(),
}));

vi.mock("@/shared/services/evolutionApiService", () => ({
  fetchEvolutionConnectionState: vi.fn(),
  fetchEvolutionConnectionStateStrict: vi.fn(() => Promise.resolve("close")),
  fetchEvolutionQr: vi.fn(),
  logoutEvolutionInstance: vi.fn(),
  createEvolutionInstance: vi.fn(),
}));

vi.mock("@/shared/infra/queue/redisConnection", () => ({
  getRedisConnection: vi.fn(() => ({})),
}));

vi.mock("bullmq", () => ({
  Queue: class {
    constructor() {
      return mocks.queue as never;
    }
  },
}));

import { AdminWhatsAppController } from "./AdminWhatsAppController";
import { getPlatformWhatsAppSettings } from "@/shared/services/platformWhatsAppSettings";

function settings(overrides: Record<string, unknown> = {}) {
  return {
    aiGloballyEnabled: true,
    ownerBotGloballyEnabled: true,
    outboundPaused: false,
    reason: null,
    updatedBy: null,
    updatedAt: new Date(),
    ...overrides,
  };
}

function replyCollector() {
  const sent: Array<{ success: boolean; data: Record<string, unknown> }> = [];
  return { sent, reply: { send: (p: unknown) => sent.push(p as never) } as never };
}

function request(params: Record<string, string>, body: unknown = {}) {
  return { params, body, ip: "127.0.0.1", headers: {}, query: {}, user: { id: "admin-1" } } as never;
}

function delivery(overrides: Record<string, unknown> = {}) {
  return {
    id: DELIVERY_ID,
    channel: "WHATSAPP",
    status: "FAILED",
    destinationHash: "hash-do-destinatario",
    barbershopId: SHOP_ID,
    type: "APPOINTMENT_CONFIRMATION",
    ...overrides,
  };
}

describe("AdminWhatsAppController — reenvio e supressão", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPlatformWhatsAppSettings).mockResolvedValue(settings());
    mocks.prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn(mocks.tx)
    );
  });

  it("bloqueia reenvio quando os envios estão pausados", async () => {
    vi.mocked(getPlatformWhatsAppSettings).mockResolvedValue(settings({ outboundPaused: true }));

    await expect(
      new AdminWhatsAppController().retryDelivery(
        request({ id: DELIVERY_ID }, { reason: REASON }),
        replyCollector().reply
      )
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(mocks.prisma.notificationDelivery.findUnique).not.toHaveBeenCalled();
  });

  it("consulta a supressão pelo destinationHash do destinatário", async () => {
    mocks.prisma.notificationDelivery.findUnique.mockResolvedValue(delivery());
    mocks.prisma.notificationSuppression.findFirst.mockResolvedValue({ id: "sup-1" });

    await expect(
      new AdminWhatsAppController().retryDelivery(
        request({ id: DELIVERY_ID }, { reason: REASON }),
        replyCollector().reply
      )
    ).rejects.toMatchObject({ statusCode: 409, message: "Destinatário suprimido" });

    expect(mocks.prisma.notificationSuppression.findFirst).toHaveBeenCalledWith({
      where: { channel: "WHATSAPP", destinationHash: "hash-do-destinatario", active: true },
      select: { id: true },
    });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("consulta a preferência pelo tipo da notificação", async () => {
    mocks.prisma.notificationDelivery.findUnique.mockResolvedValue(delivery());
    mocks.prisma.notificationSuppression.findFirst.mockResolvedValue(null);
    mocks.prisma.notificationPreference.findFirst.mockResolvedValue({ id: "pref-1" });

    await expect(
      new AdminWhatsAppController().retryDelivery(
        request({ id: DELIVERY_ID }, { reason: REASON }),
        replyCollector().reply
      )
    ).rejects.toMatchObject({ statusCode: 409, message: "Preferência de WhatsApp desligada" });

    expect(mocks.prisma.notificationPreference.findFirst).toHaveBeenCalledWith({
      where: {
        barbershopId: SHOP_ID,
        channel: "WHATSAPP",
        type: "APPOINTMENT_CONFIRMATION",
        enabled: false,
      },
      select: { id: true },
    });
  });

  it("não consulta preferência de outro salão quando a entrega não tem barbershopId", async () => {
    mocks.prisma.notificationDelivery.findUnique.mockResolvedValue(
      delivery({ barbershopId: null })
    );
    mocks.prisma.notificationSuppression.findFirst.mockResolvedValue(null);
    const { sent, reply } = replyCollector();

    await new AdminWhatsAppController().retryDelivery(
      request({ id: DELIVERY_ID }, { reason: REASON }),
      reply
    );

    expect(mocks.prisma.notificationPreference.findFirst).not.toHaveBeenCalled();
    expect(mocks.tx.notificationDelivery.update).toHaveBeenCalledOnce();
    expect(sent[0].data).toEqual({ id: DELIVERY_ID, retried: true });
  });

  it("reenvia quando não há pausa, supressão nem preferência desligada", async () => {
    mocks.prisma.notificationDelivery.findUnique.mockResolvedValue(delivery());
    mocks.prisma.notificationSuppression.findFirst.mockResolvedValue(null);
    mocks.prisma.notificationPreference.findFirst.mockResolvedValue(null);
    const { sent, reply } = replyCollector();

    await new AdminWhatsAppController().retryDelivery(
      request({ id: DELIVERY_ID }, { reason: REASON }),
      reply
    );

    expect(mocks.tx.notificationDelivery.update).toHaveBeenCalledWith({
      where: { id: DELIVERY_ID },
      data: { status: "PENDING", failedAt: null },
    });
    expect(mocks.tx.auditLog.create).toHaveBeenCalledOnce();
    expect(sent[0].data).toEqual({ id: DELIVERY_ID, retried: true });
  });
});

describe("AdminWhatsAppController — lote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn(mocks.tx)
    );
  });

  it("atualiza IA em lote e audita cada salão", async () => {
    mocks.prisma.barbershop.findMany.mockResolvedValue([
      { id: SHOP_ID, whatsappAiEnabled: false },
    ]);
    mocks.tx.barbershop.updateMany.mockResolvedValue({ count: 1 });
    const { sent, reply } = replyCollector();

    await new AdminWhatsAppController().batchPatchShopAi(
      request({}, { ids: [SHOP_ID], enabled: true, reason: REASON }),
      reply
    );

    expect(mocks.tx.barbershop.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [SHOP_ID] } },
      data: { whatsappAiEnabled: true },
    });
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "WHATSAPP_AI_TOGGLE",
          barbershopId: SHOP_ID,
          details: expect.stringContaining('"batch":true'),
        }),
      })
    );
    expect(sent[0].data).toEqual({ updated: 1 });
  });

  it("recusa lote com salão inexistente", async () => {
    mocks.prisma.barbershop.findMany.mockResolvedValue([]);

    await expect(
      new AdminWhatsAppController().batchPatchShopAi(
        request({}, { ids: [SHOP_ID], enabled: true, reason: REASON }),
        replyCollector().reply
      )
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("atualiza o assistente do dono em lote", async () => {
    mocks.prisma.barbershop.findMany.mockResolvedValue([{ id: SHOP_ID }]);
    const { sent, reply } = replyCollector();

    await new AdminWhatsAppController().batchPatchShopOwnerBot(
      request({}, { ids: [SHOP_ID], enabled: false, blocked: true, reason: REASON }),
      reply
    );

    expect(mocks.tx.ownerBotPreference.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { barbershopId: SHOP_ID },
        update: expect.objectContaining({ enabled: false, blocked: true }),
      })
    );
    expect(mocks.tx.auditLog.create).toHaveBeenCalledOnce();
    expect(sent[0].data).toEqual({ updated: 1 });
  });
});

describe("AdminWhatsAppController — máscara nas filas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queue.getJobCounts.mockResolvedValue({ wait: 1, active: 0, completed: 0, failed: 1, delayed: 0 });
    mocks.queue.getFailed.mockResolvedValue([
      {
        id: "job-1",
        name: "send",
        failedReason: "erro",
        attemptsMade: 1,
        timestamp: 1,
        data: { phone: "5511999999999" },
      },
    ]);
    mocks.queue.close.mockResolvedValue(undefined);
  });

  it("devolve o telefone mascarado e não expõe o número completo", async () => {
    const { sent, reply } = replyCollector();

    await new AdminWhatsAppController().queues(request({}), reply);

    const failed = (
      sent[0].data as {
        failed: Record<string, { available: boolean; jobs?: Array<{ phoneMasked: string }> }>;
      }
    ).failed;
    expect(failed.whatsapp.available).toBe(true);
    expect(failed.whatsapp.jobs?.[0].phoneMasked).toBe("***9999");
    expect(JSON.stringify(sent[0].data)).not.toContain("5511999999999");
  });
});
