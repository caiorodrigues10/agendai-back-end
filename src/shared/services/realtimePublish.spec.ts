import { beforeEach, describe, expect, it, vi } from "vitest";
import { MockQueueRepository } from "@/modules/queue/infra/repositories/mocks/MockQueueRepository";
import { MockAppointmentRepository } from "@/modules/appointments/infra/repositories/mocks/MockAppointmentRepository";
import { DeleteQueueItemUseCase } from "@/modules/queue/useCases/deleteQueueItem/DeleteQueueItemUseCase";
import { UpdateQueueItemUseCase } from "@/modules/queue/useCases/updateQueueItem/UpdateQueueItemUseCase";
import { JoinQueueUseCase } from "@/modules/queue/useCases/joinQueue/JoinQueueUseCase";
import {
  CreateAppointmentUseCase,
  UpdateAppointmentUseCase,
  CancelAppointmentUseCase,
} from "@/modules/appointments/useCases/appointmentUseCases";
import { publishRealtime } from "@/shared/services/realtimeService";
import { getShopOpenState } from "@/modules/barbershops/utils/getShopOpenState";
import { prisma } from "@/libs/prismaClient";

vi.mock("@/shared/services/realtimeService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/services/realtimeService")>();
  return { ...actual, publishRealtime: vi.fn() };
});

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

const staff = { id: "u1", role: "OWNER" as const, barbershopId: "shop-1" };

describe("publishRealtime nas mutações de fila e agenda", () => {
  beforeEach(() => {
    vi.mocked(publishRealtime).mockClear();
  });

  it("join queue publica queue:changed", async () => {
    const queues = new MockQueueRepository();
    const join = new JoinQueueUseCase(queues as any, { findById: vi.fn() } as any);
    vi.mocked(getShopOpenState).mockResolvedValue({
      open: true,
      reason: "SCHEDULE",
      queueClosed: false,
    } as any);
    vi.mocked(prisma.service.findFirst).mockResolvedValue({ id: "svc-1" } as any);
    vi.mocked(prisma.queueItem.findFirst).mockResolvedValue(null as any);

    await join.execute({
      barbershopId: "shop-1",
      customerName: "João",
      whatsapp: "11988887777",
      serviceId: "svc-1",
      customerId: "cust-1",
      addedByStaff: true,
    });

    expect(publishRealtime).toHaveBeenCalledWith("shop-1", "queue:changed");
  });

  it("update e delete da fila publicam queue:changed", async () => {
    const queues = new MockQueueRepository();
    const notify = { execute: vi.fn().mockResolvedValue({ notified: 0, failed: 0 }) };
    const shops = { findById: vi.fn().mockResolvedValue({ id: "shop-1", name: "X" }) };
    const update = new UpdateQueueItemUseCase(queues as any, notify as any, shops as any);
    const del = new DeleteQueueItemUseCase(queues as any, notify as any);

    const item = await queues.create({
      barbershopId: "shop-1",
      customerName: "Ana",
      whatsapp: "11999999999",
      serviceId: "svc-1",
      customerId: "cust-2",
    });

    await update.execute(item.id, "cancelled", staff);
    expect(publishRealtime).toHaveBeenCalledWith("shop-1", "queue:changed");

    vi.mocked(publishRealtime).mockClear();
    const other = await queues.create({
      barbershopId: "shop-1",
      customerName: "Bia",
      whatsapp: "11888888888",
      serviceId: "svc-1",
      customerId: "cust-3",
    });
    await del.execute(other.id, staff);
    expect(publishRealtime).toHaveBeenCalledWith("shop-1", "queue:changed");
  });

  it("criar, atualizar e cancelar agendamento publicam appointments:changed", async () => {
    const repo = new MockAppointmentRepository();
    const create = new CreateAppointmentUseCase(repo as any);
    const update = new UpdateAppointmentUseCase(repo as any);
    const cancel = new CancelAppointmentUseCase(repo as any);

    const apt = await create.execute(
      {
        barbershopId: "shop-1",
        serviceId: "svc-1",
        customerName: "João Silva",
        whatsapp: "5599999999999",
        date: "2026-07-01",
        time: "10:00",
      },
      staff
    );
    expect(publishRealtime).toHaveBeenCalledWith("shop-1", "appointments:changed");

    vi.mocked(publishRealtime).mockClear();
    await update.execute(apt.id, { status: "NO_SHOW" }, staff);
    expect(publishRealtime).toHaveBeenCalledWith("shop-1", "appointments:changed");

    vi.mocked(publishRealtime).mockClear();
    await cancel.execute(apt.id, staff);
    expect(publishRealtime).toHaveBeenCalledWith("shop-1", "appointments:changed");
  });
});
