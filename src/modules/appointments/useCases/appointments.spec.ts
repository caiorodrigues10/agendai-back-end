import { describe, it, expect, beforeEach } from "vitest";
import { MockAppointmentRepository } from "@/modules/appointments/infra/repositories/mocks/MockAppointmentRepository";
import {
  CreateAppointmentUseCase,
  GetAppointmentUseCase,
  ListAppointmentsUseCase,
  UpdateAppointmentUseCase,
  CancelAppointmentUseCase,
} from "./appointmentUseCases";
import { AppError } from "@/shared/errors/AppError";

const ADMIN = { role: "MASTER_ADMIN" } as const;
const owner = (barbershopId: string) => ({ role: "OWNER", barbershopId });
const otherOwner = { role: "OWNER", barbershopId: "other-shop" } as const;

let repo: MockAppointmentRepository;

beforeEach(() => {
  repo = new MockAppointmentRepository();
});

describe("Appointments module", () => {
  it("cria agendamento e lista por barbearia", async () => {
    const create = new CreateAppointmentUseCase(repo as any);
    const list = new ListAppointmentsUseCase(repo as any);

    const apt = await create.execute(
      {
        barbershopId: "shop-1",
        serviceId: "svc-1",
        customerName: "João Silva",
        whatsapp: "5599999999999",
        date: "2026-07-01",
        time: "10:00",
      },
      owner("shop-1")
    );

    expect(apt.status).toBe("CONFIRMED");
    expect(apt.customerName).toBe("João Silva");

    const result = await list.execute("shop-1", { page: 1, limit: 20 }, ADMIN);
    expect(result.data.length).toBe(1);
    expect(result.total).toBe(1);
  });

  it("busca agendamento por id", async () => {
    const create = new CreateAppointmentUseCase(repo as any);
    const get = new GetAppointmentUseCase(repo as any);

    const apt = await create.execute(
      {
        barbershopId: "shop-1",
        serviceId: "svc-1",
        customerName: "Maria",
        whatsapp: "5588888888888",
        date: "2026-07-02",
        time: "14:00",
      },
      ADMIN
    );

    const found = await get.execute(apt.id, ADMIN);
    expect(found.id).toBe(apt.id);
  });

  it("atualiza status para COMPLETED", async () => {
    const create = new CreateAppointmentUseCase(repo as any);
    const update = new UpdateAppointmentUseCase(repo as any);

    const apt = await create.execute(
      {
        barbershopId: "shop-1",
        serviceId: "svc-1",
        customerName: "Pedro",
        whatsapp: "5577777777777",
        date: "2026-07-03",
        time: "09:00",
      },
      ADMIN
    );

    const updated = await update.execute(
      apt.id,
      { status: "COMPLETED" },
      ADMIN
    );
    expect(updated.status).toBe("COMPLETED");
  });

  it("cancela agendamento", async () => {
    const create = new CreateAppointmentUseCase(repo as any);
    const cancel = new CancelAppointmentUseCase(repo as any);
    const get = new GetAppointmentUseCase(repo as any);

    const apt = await create.execute(
      {
        barbershopId: "shop-1",
        serviceId: "svc-1",
        customerName: "Ana",
        whatsapp: "5566666666666",
        date: "2026-07-04",
        time: "11:00",
      },
      ADMIN
    );

    await cancel.execute(apt.id, ADMIN);
    const found = await get.execute(apt.id, ADMIN);
    expect(found.status).toBe("CANCELLED");
  });

  it("lança 404 para id inexistente", async () => {
    const get = new GetAppointmentUseCase(repo as any);
    await expect(get.execute("not-found", ADMIN)).rejects.toBeInstanceOf(AppError);
  });

  it("lança 403 quando OWNER tenta acessar agendamento de outra barbearia", async () => {
    const create = new CreateAppointmentUseCase(repo as any);
    const get = new GetAppointmentUseCase(repo as any);

    const apt = await create.execute(
      {
        barbershopId: "shop-1",
        serviceId: "svc-1",
        customerName: "Cliente",
        whatsapp: "5500000000000",
        date: "2026-07-05",
        time: "15:00",
      },
      ADMIN
    );

    await expect(get.execute(apt.id, otherOwner)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("lança 409 ao tentar cancelar agendamento já cancelado", async () => {
    const create = new CreateAppointmentUseCase(repo as any);
    const cancel = new CancelAppointmentUseCase(repo as any);

    const apt = await create.execute(
      {
        barbershopId: "shop-1",
        serviceId: "svc-1",
        customerName: "Duplo",
        whatsapp: "5511111111111",
        date: "2026-07-06",
        time: "16:00",
      },
      ADMIN
    );

    await cancel.execute(apt.id, ADMIN);
    await expect(cancel.execute(apt.id, ADMIN)).rejects.toMatchObject({
      statusCode: 409,
    });
  });
});
