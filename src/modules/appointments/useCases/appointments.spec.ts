import { describe, it, expect, beforeEach, vi } from "vitest";
import { MockAppointmentRepository } from "@/modules/appointments/infra/repositories/mocks/MockAppointmentRepository";
import { MockQueueRepository } from "@/modules/queue/infra/repositories/mocks/MockQueueRepository";
import { MockBarbershopRepository } from "@/modules/barbershops/infra/repositories/mocks/MockBarbershopRepository";
import { GetQueueWaitEstimateUseCase } from "@/modules/queue/useCases/getQueueWaitEstimate/GetQueueWaitEstimateUseCase";
import {
  CreateAppointmentUseCase,
  GetAppointmentUseCase,
  ListAppointmentsUseCase,
  UpdateAppointmentUseCase,
  CancelAppointmentUseCase,
  SendAppointmentRemindersUseCase,
} from "./appointmentUseCases";
import { AppError } from "@/shared/errors/AppError";
import * as whatsapp from "@/shared/services/whatsappNotificationService";

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

  describe("SendAppointmentRemindersUseCase", () => {
    let shops: MockBarbershopRepository;

    function todayIso(): string {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
    }

    beforeEach(() => {
      shops = new MockBarbershopRepository();
    });

    it("envio com sucesso marca reminderSentAt", async () => {
      const sendSpy = vi
        .spyOn(whatsapp, "sendWhatsAppMessage")
        .mockResolvedValue(true);

      const create = new CreateAppointmentUseCase(repo as any);
      const apt = await create.execute(
        {
          barbershopId: "shop-1",
          serviceId: "svc-1",
          customerName: "João",
          whatsapp: "11999999999",
          date: todayIso(),
          time: "10:30",
        },
        ADMIN
      );
      // mock: preenche nomes para a mensagem
      const stored = repo.appointments.find((a) => a.id === apt.id)!;
      stored.barbershopName = "Barbearia Central";
      stored.serviceName = "Corte";

      const useCase = new SendAppointmentRemindersUseCase(
        repo as any,
        new GetQueueWaitEstimateUseCase(new MockQueueRepository() as any),
        shops as any
      );
      const result = await useCase.execute();

      expect(result).toEqual({ sent: 1, failed: 0, queueMessagesFailed: 0 });
      expect(sendSpy).toHaveBeenCalledOnce();
      expect(sendSpy.mock.calls[0][0]).toBe("11999999999");
      expect(sendSpy.mock.calls[0][1]).toContain("João");
      expect(sendSpy.mock.calls[0][1]).toContain("10:30");
      expect(sendSpy.mock.calls[0][1]).toContain("Barbearia Central");
      expect(repo.appointments.find((a) => a.id === apt.id)?.reminderSentAt).toBeInstanceOf(
        Date
      );

      sendSpy.mockRestore();
    });

    it("falha no envio não marca reminderSentAt", async () => {
      const sendSpy = vi
        .spyOn(whatsapp, "sendWhatsAppMessage")
        .mockResolvedValue(false);

      const create = new CreateAppointmentUseCase(repo as any);
      const apt = await create.execute(
        {
          barbershopId: "shop-1",
          serviceId: "svc-1",
          customerName: "Maria",
          whatsapp: "11888888888",
          date: todayIso(),
          time: "14:00",
        },
        ADMIN
      );

      const useCase = new SendAppointmentRemindersUseCase(
        repo as any,
        new GetQueueWaitEstimateUseCase(new MockQueueRepository() as any),
        shops as any
      );
      const result = await useCase.execute();

      expect(result).toEqual({ sent: 0, failed: 1, queueMessagesFailed: 0 });
      expect(
        repo.appointments.find((a) => a.id === apt.id)?.reminderSentAt
      ).toBeNull();

      sendSpy.mockRestore();
    });

    it("nenhum agendamento hoje retorna { sent: 0, failed: 0 }", async () => {
      const sendSpy = vi
        .spyOn(whatsapp, "sendWhatsAppMessage")
        .mockResolvedValue(true);

      const create = new CreateAppointmentUseCase(repo as any);
      await create.execute(
        {
          barbershopId: "shop-1",
          serviceId: "svc-1",
          customerName: "Futuro",
          whatsapp: "11777777777",
          date: "2099-01-01",
          time: "09:00",
        },
        ADMIN
      );

      const useCase = new SendAppointmentRemindersUseCase(
        repo as any,
        new GetQueueWaitEstimateUseCase(new MockQueueRepository() as any),
        shops as any
      );
      const result = await useCase.execute();

      expect(result).toEqual({ sent: 0, failed: 0, queueMessagesFailed: 0 });
      expect(sendSpy).not.toHaveBeenCalled();

      sendSpy.mockRestore();
    });

    it("exceção em um agendamento não aborta o loop e contabiliza failed", async () => {
      // Cria dois agendamentos para hoje.
      const create = new CreateAppointmentUseCase(repo as any);
      const aptOk = await create.execute(
        {
          barbershopId: "shop-1",
          serviceId: "svc-1",
          customerName: "Bom",
          whatsapp: "11912345678",
          date: todayIso(),
          time: "11:00",
        },
        ADMIN
      );
      const aptBad = await create.execute(
        {
          barbershopId: "shop-1",
          serviceId: "svc-1",
          customerName: "Ruim",
          whatsapp: "11987654321",
          date: todayIso(),
          time: "12:00",
        },
        ADMIN
      );

      // Para o "Ruim", o envio lança; para o "Bom", envio bem-sucedido.
      const sendSpy = vi
        .spyOn(whatsapp, "sendWhatsAppMessage")
        .mockImplementation(async (phone: string) => {
          if (phone === "11987654321") {
            throw new Error("boom");
          }
          return true;
        });

      const useCase = new SendAppointmentRemindersUseCase(
        repo as any,
        new GetQueueWaitEstimateUseCase(new MockQueueRepository() as any),
        shops as any
      );
      const result = await useCase.execute();

      expect(result).toEqual({ sent: 1, failed: 1, queueMessagesFailed: 0 });
      // Apesar de o "Ruim" ter lançado, o "Bom" foi processado e marcado.
      expect(
        repo.appointments.find((a) => a.id === aptOk.id)?.reminderSentAt
      ).toBeInstanceOf(Date);
      // E o "Ruim" não foi marcado.
      expect(
        repo.appointments.find((a) => a.id === aptBad.id)?.reminderSentAt
      ).toBeNull();

      sendSpy.mockRestore();
    });

    it("usa evolutionInstanceName da barbearia quando configurado (não passa instanceName = undefined)", async () => {
      const sendSpy = vi
        .spyOn(whatsapp, "sendWhatsAppMessage")
        .mockResolvedValue(true);

      const create = new CreateAppointmentUseCase(repo as any);
      const apt = await create.execute(
        {
          barbershopId: "shop-evo",
          serviceId: "svc-1",
          customerName: "Cliente Evo",
          whatsapp: "11977776666",
          date: todayIso(),
          time: "15:00",
        },
        ADMIN
      );
      const stored = repo.appointments.find((a) => a.id === apt.id)!;
      stored.barbershopName = "Barbearia Evo";
      stored.serviceName = "Corte";

      // Cria a barbearia e seta a instanceName própria.
      const shop = await shops.create({
        name: "Barbearia Evo",
        whatsapp: "11900000000",
      });
      shop.id = "shop-evo";
      await shops.update("shop-evo", { evolutionInstanceName: "minha-instancia" });

      const useCase = new SendAppointmentRemindersUseCase(
        repo as any,
        new GetQueueWaitEstimateUseCase(new MockQueueRepository() as any),
        shops as any
      );
      const result = await useCase.execute();

      expect(result.sent).toBe(1);
      expect(sendSpy).toHaveBeenCalledOnce();
      // O 3º argumento deve ser um objeto com instanceName preenchido.
      const opts = sendSpy.mock.calls[0][2] as { instanceName?: string };
      expect(opts).toBeDefined();
      expect(opts.instanceName).toBe("minha-instancia");

      sendSpy.mockRestore();
    });

    it("barbearia sem evolutionInstanceName: passa instanceName = undefined (cai no fallback do env)", async () => {
      const sendSpy = vi
        .spyOn(whatsapp, "sendWhatsAppMessage")
        .mockResolvedValue(true);

      const create = new CreateAppointmentUseCase(repo as any);
      const apt = await create.execute(
        {
          barbershopId: "shop-fallback",
          serviceId: "svc-1",
          customerName: "Cliente Fallback",
          whatsapp: "11955554444",
          date: todayIso(),
          time: "16:00",
        },
        ADMIN
      );
      const stored = repo.appointments.find((a) => a.id === apt.id)!;
      stored.barbershopName = "Barbearia Padrão";
      stored.serviceName = "Corte";

      // Cria a barbearia SEM evolutionInstanceName.
      const shop = await shops.create({
        name: "Barbearia Padrão",
        whatsapp: "11911111111",
      });
      shop.id = "shop-fallback";

      const useCase = new SendAppointmentRemindersUseCase(
        repo as any,
        new GetQueueWaitEstimateUseCase(new MockQueueRepository() as any),
        shops as any
      );
      const result = await useCase.execute();

      expect(result.sent).toBe(1);
      expect(sendSpy).toHaveBeenCalledOnce();
      const opts = sendSpy.mock.calls[0][2] as { instanceName?: string };
      expect(opts).toBeDefined();
      // instanceName indefinido ⇒ fallback do env global.
      expect(opts.instanceName).toBeUndefined();

      sendSpy.mockRestore();
    });
  });
});
