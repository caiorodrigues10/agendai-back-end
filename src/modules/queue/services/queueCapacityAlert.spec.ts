import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findShop: vi.fn(),
  countWaiting: vi.fn(),
  enqueue: vi.fn(),
}));

vi.mock("@/libs/prismaClient", () => ({
  prisma: {
    barbershop: { findUnique: mocks.findShop },
    queueItem: { count: mocks.countWaiting },
  },
}));
vi.mock("@/shared/infra/queue", () => ({ enqueueWhatsApp: mocks.enqueue }));

import { notifyQueueCapacity } from "./queueCapacityAlert";

describe("notifyQueueCapacity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findShop.mockResolvedValue({ name: "Studio", whatsapp: "11999999999", queueAlertEnabled: true, queueAlertThreshold: 10, queueAlertPhone: "11888888888", evolutionInstanceName: "studio" });
  });

  it("não envia quando a fila está exatamente no limite", async () => {
    mocks.countWaiting.mockResolvedValue(10);
    await notifyQueueCapacity("shop-1", "queue-10", "Cliente");
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it("envia para cada novo item acima do limite com chave idempotente", async () => {
    mocks.countWaiting.mockResolvedValue(11);
    await notifyQueueCapacity("shop-1", "queue-11", "Cliente");
    expect(mocks.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      phone: "11888888888",
      notificationType: "QUEUE_CAPACITY_ALERT",
      deduplicationKey: "queue-capacity:shop-1:queue-11",
    }));
  });

  it("não envia quando o recurso está desativado", async () => {
    mocks.findShop.mockResolvedValue({ name: "Studio", whatsapp: "11999999999", queueAlertEnabled: false, queueAlertThreshold: 10, queueAlertPhone: null, evolutionInstanceName: "studio" });
    mocks.countWaiting.mockResolvedValue(20);
    await notifyQueueCapacity("shop-1", "queue-20", "Cliente");
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });
});
