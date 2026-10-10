/// <reference types="vitest/globals" />
/**
 * `recordTerminalNotificationFailure` gravava a delivery e o outbox em
 * `$transaction([…])` (array-form) — com a extensão RLS, as duas escritas
 * rodavam em conexões separadas.
 */
const rlsHolder = vi.hoisted(() => ({ tx: undefined as unknown }));
const rlsMock = vi.hoisted(() =>
  vi.fn(async (fn: (tx: unknown) => unknown) => fn(rlsHolder.tx)),
);
vi.mock("@/libs/prismaExtensions", () => ({ rlsTransaction: rlsMock }));

const prismaMock = vi.hoisted(() => ({
  notificationDelivery: { update: vi.fn() },
  notificationOutbox: { update: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("@/libs/prismaClient", () => ({ prisma: prismaMock }));

import { recordTerminalNotificationFailure } from "./notificationDeliveryService";

describe("recordTerminalNotificationFailure — atomicidade", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rlsHolder.tx = prismaMock;
    rlsMock.mockClear();
    prismaMock.notificationDelivery.update.mockResolvedValue({});
    prismaMock.notificationOutbox.update.mockResolvedValue({});
  });

  it("grava falha terminal e purgeAfter na MESMA transação", async () => {
    await recordTerminalNotificationFailure("del-1", new Error("boom"));

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
