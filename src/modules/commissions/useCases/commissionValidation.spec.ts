import { beforeEach, describe, expect, it, vi } from "vitest";
import { MockQueueRepository } from "@/modules/queue/infra/repositories/mocks/MockQueueRepository";
import { UpdateQueueItemUseCase } from "@/modules/queue/useCases/updateQueueItem/UpdateQueueItemUseCase";

describe("commission validation on queue completion", () => {
  let queue: MockQueueRepository;
  let serviceRepository: { findById: ReturnType<typeof vi.fn> };
  let userRepository: { listActiveByBarbershop: ReturnType<typeof vi.fn> };
  let commissionRepository: { hasEntriesForQueueItem: ReturnType<typeof vi.fn> };
  let useCase: UpdateQueueItemUseCase;

  beforeEach(async () => {
    queue = new MockQueueRepository();
    await queue.create({ barbershopId: "shop-1", serviceId: "service-1", customerId: "customer-1", customerName: "Ana", whatsapp: "11999999999" });
    await queue.updateStatus("queue-1", "in_chair");
    serviceRepository = { findById: vi.fn().mockResolvedValue({ commissionPercent: 40 }) };
    userRepository = { listActiveByBarbershop: vi.fn().mockImplementation(async (_barbershopId: string, ids: string[]) => ids.map((id) => ({ id }))) };
    commissionRepository = { hasEntriesForQueueItem: vi.fn().mockResolvedValue(false) };
    useCase = new UpdateQueueItemUseCase(
      queue,
      { execute: vi.fn().mockResolvedValue(undefined) } as never,
      { findById: vi.fn() } as never,
      undefined,
      undefined,
      serviceRepository as never,
      userRepository as never,
      commissionRepository as never,
    );
  });

  it("infere uma comissão simples pelo profissional que concluiu", async () => {
    await useCase.execute("queue-1", "completed", { id: "staff-1", role: "EMPLOYEE", barbershopId: "shop-1" }, { finalPrice: 100 });
    expect(userRepository.listActiveByBarbershop).toHaveBeenCalledWith("shop-1", ["staff-1"]);
  });

  it("aceita divisão que fecha exatamente o percentual do serviço", async () => {
    await useCase.execute("queue-1", "completed", { id: "staff-1", role: "OWNER", barbershopId: "shop-1" }, {
      finalPrice: 120,
      commissionSplits: [{ professionalId: "staff-1", percentage: 25 }, { professionalId: "staff-2", percentage: 15 }],
    });
    expect(userRepository.listActiveByBarbershop).toHaveBeenCalledWith("shop-1", ["staff-1", "staff-2"]);
  });

  it("rejeita divisão que não fecha o percentual configurado", async () => {
    await expect(useCase.execute("queue-1", "completed", { id: "staff-1", role: "OWNER", barbershopId: "shop-1" }, {
      finalPrice: 100, commissionSplits: [{ professionalId: "staff-1", percentage: 30 }],
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rejeita profissional fora do salão", async () => {
    userRepository.listActiveByBarbershop.mockResolvedValue([]);
    await expect(useCase.execute("queue-1", "completed", { id: "staff-1", role: "OWNER", barbershopId: "shop-1" }, {
      finalPrice: 100, commissionSplits: [{ professionalId: "other-staff", percentage: 40 }],
    })).rejects.toMatchObject({ statusCode: 400 });
  });
});
