/// <reference types="vitest/globals" />
/**
 * O worker de notificações gravava attempt + delivery + outbox em
 * `$transaction([…])` (array-form). Com a extensão RLS reroteando cada
 * operação, as escritas rodavam em conexões separadas: dava para marcar a
 * tentativa como SUCCEEDED sem marcar a delivery como SENT (ou marcar a
 * delivery FAILED sem gravar o erro na attempt).
 */
const rlsHolder = vi.hoisted(() => ({ tx: undefined as unknown }));
const rlsMock = vi.hoisted(() =>
  vi.fn(async (fn: (tx: unknown) => unknown) => fn(rlsHolder.tx)),
);
vi.mock("@/libs/prismaExtensions", () => ({ rlsTransaction: rlsMock }));

const prismaMock = vi.hoisted(() => ({
  notificationAttempt: { update: vi.fn() },
  notificationDelivery: { update: vi.fn(), updateMany: vi.fn() },
  notificationOutbox: { update: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("@/libs/prismaClient", () => ({ prisma: prismaMock }));

vi.mock("bullmq", () => ({ Worker: vi.fn(), UnrecoverableError: class extends Error {} }));
vi.mock("./redisConnection", () => ({ getRedisConnection: vi.fn() }));
vi.mock("@/modules/crm/services/campaignStatusService", () => ({
  refreshCrmCampaignStatus: vi.fn(),
}));
vi.mock("@/modules/notifications/services/notificationDeliveryService", () => ({
  getNotificationV2Mode: vi.fn(() => "active"),
  loadNotificationPayload: vi.fn(),
}));
vi.mock("@/shared/services/evolutionApiService", () => ({
  sendWhatsAppMessageDetailed: vi.fn(),
}));
vi.mock("./emailWorker", () => ({ buildEmailPayload: vi.fn() }));

import { completeAttempt, failAttempt } from "./notificationWorker";

describe("notificationWorker — atomicidade", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rlsHolder.tx = prismaMock;
    rlsMock.mockClear();
    prismaMock.notificationAttempt.update.mockResolvedValue({});
    prismaMock.notificationDelivery.update.mockResolvedValue({});
    prismaMock.notificationOutbox.update.mockResolvedValue({});
  });

  it("completeAttempt grava attempt, delivery e outbox na MESMA transação", async () => {
    await completeAttempt("del-1", "att-1", { provider: "RESEND", httpStatus: 200 });

    expect(rlsMock).toHaveBeenCalledTimes(1);
    expect(prismaMock.notificationAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "att-1" },
        data: expect.objectContaining({ status: "SUCCEEDED" }),
      }),
    );
    expect(prismaMock.notificationDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "del-1" },
        data: expect.objectContaining({ status: "SENT" }),
      }),
    );
    expect(prismaMock.notificationOutbox.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deliveryId: "del-1" } }),
    );
  });

  it("failAttempt grava attempt e delivery na MESMA transação", async () => {
    const safe = await failAttempt("del-1", "att-1", new Error("boom"), false);

    expect(rlsMock).toHaveBeenCalledTimes(1);
    expect(safe.code).toBeTruthy();
    expect(prismaMock.notificationAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "att-1" },
        data: expect.objectContaining({ status: "FAILED" }),
      }),
    );
    expect(prismaMock.notificationDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "del-1" },
        data: expect.objectContaining({ status: "RETRYING" }),
      }),
    );
    expect(prismaMock.notificationOutbox.update).not.toHaveBeenCalled();
  });

  it("failAttempt final também fecha o outbox na MESMA transação", async () => {
    await failAttempt("del-1", "att-1", new Error("boom"), true);

    expect(rlsMock).toHaveBeenCalledTimes(1);
    expect(prismaMock.notificationDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "del-1" },
        data: expect.objectContaining({ status: "FAILED" }),
      }),
    );
    expect(prismaMock.notificationOutbox.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deliveryId: "del-1" } }),
    );
  });
});
