import { beforeEach, describe, expect, it, vi } from "vitest";
import { JoinQueueUseCase } from "./JoinQueueUseCase";
import { MockQueueRepository } from "@/modules/queue/infra/repositories/mocks/MockQueueRepository";
import { getShopOpenState } from "@/modules/barbershops/utils/getShopOpenState";
import { prisma } from "@/libs/prismaClient";

vi.mock("@/shared/utils/assertPublicShopOperationalAccess", () => ({
  assertPublicShopOperationalAccess: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/shared/utils/assertOperationEnabled", () => ({
  assertOperationEnabled: vi.fn().mockResolvedValue("HYBRID"),
}));

vi.mock("@/modules/barbershops/utils/getShopOpenState", () => ({
  getShopOpenState: vi.fn(),
}));

vi.mock("@/libs/prismaClient", () => ({
  prisma: {
    service: { findFirst: vi.fn() },
    queueItem: { findFirst: vi.fn() },
  },
}));

const payload = {
  barbershopId: "shop-1",
  customerName: "João",
  whatsapp: "11988887777",
  serviceId: "svc-1",
  customerId: "cust-1",
};

describe("JoinQueueUseCase — status do salão", () => {
  let queues: MockQueueRepository;
  let join: JoinQueueUseCase;

  beforeEach(() => {
    queues = new MockQueueRepository();
    join = new JoinQueueUseCase(queues as any, { findById: vi.fn() } as any);
    vi.mocked(getShopOpenState).mockReset();
    vi.mocked(prisma.service.findFirst).mockResolvedValue({ id: "svc-1" } as any);
    vi.mocked(prisma.queueItem.findFirst).mockResolvedValue(null as any);
  });

  it("recusa entrada pública com o salão fechado", async () => {
    vi.mocked(getShopOpenState).mockResolvedValue({
      open: false,
      reason: "MANUAL_CLOSED",
      queueClosed: false,
    });
    await expect(join.execute(payload)).rejects.toMatchObject({
      statusCode: 403,
      message: "Salão fechado no momento",
    });
  });

  it("recusa entrada pública quando o modo manual ainda não abriu", async () => {
    vi.mocked(getShopOpenState).mockResolvedValue({
      open: false,
      reason: "MANUAL_MODE_NOT_OPENED",
      queueClosed: false,
    });
    await expect(join.execute(payload)).rejects.toMatchObject({
      statusCode: 403,
      message: "O salão ainda não abriu hoje",
    });
  });

  it("recusa entrada pública com a fila encerrada", async () => {
    vi.mocked(getShopOpenState).mockResolvedValue({
      open: true,
      reason: "SCHEDULE",
      queueClosed: true,
    });
    await expect(join.execute(payload)).rejects.toMatchObject({
      statusCode: 403,
      message: "Fila encerrada por hoje",
    });
  });

  it("staff consegue adicionar walk-in mesmo com salão e fila fechados", async () => {
    vi.mocked(getShopOpenState).mockResolvedValue({
      open: false,
      reason: "MANUAL_CLOSED",
      queueClosed: true,
    });
    const item = await join.execute({ ...payload, addedByStaff: true });
    expect(item.customerName).toBe("João");
    expect(item.addedByStaff).toBe(true);
    expect(getShopOpenState).not.toHaveBeenCalled();
  });
});
