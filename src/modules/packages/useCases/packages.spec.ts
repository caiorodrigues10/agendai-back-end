import { describe, it, expect, beforeEach, vi } from "vitest";
import { MockSalonClientRepository } from "@/modules/clients/infra/repositories/mocks/MockSalonClientRepository";
import { MockServicePackageRepository } from "@/modules/packages/infra/repositories/mocks/MockServicePackageRepository";
import { MockClientPackageRepository } from "@/modules/packages/infra/repositories/mocks/MockClientPackageRepository";
import { MockServiceRepository } from "@/modules/services/infra/repositories/mocks/MockServiceRepository";
import { MockAppointmentRepository } from "@/modules/appointments/infra/repositories/mocks/MockAppointmentRepository";
import {
  CreateSalonClientUseCase,
  ListSalonClientsUseCase,
} from "@/modules/clients/useCases/clientUseCases";
import {
  CreateServicePackageUseCase,
  SellClientPackageUseCase,
  BookClientPackageUseCase,
  ConsumeClientPackageUseCase,
  CancelClientPackageUseCase,
} from "@/modules/packages/useCases/packageUseCases";
import {
  CreateAppointmentUseCase,
  CancelAppointmentUseCase,
} from "@/modules/appointments/useCases/appointmentUseCases";
import { batchSlotsOverlap } from "@/modules/packages/utils/batchSlotOverlap";
import { AppError } from "@/shared/errors/AppError";

vi.mock("@/shared/utils/assertOperationEnabled", () => ({
  assertOperationEnabled: vi.fn().mockResolvedValue("HYBRID"),
}));

const ADMIN = { role: "MASTER_ADMIN", id: "admin-1" } as const;
const owner = (barbershopId: string) => ({
  role: "OWNER" as const,
  barbershopId,
  id: "owner-1",
});

const futureDate = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
})();

describe("batchSlotsOverlap", () => {
  it("detecta overlap no mesmo dia e profissional", () => {
    expect(
      batchSlotsOverlap(
        [
          { date: futureDate, time: "10:00", staffId: "s1" },
          { date: futureDate, time: "10:15", staffId: "s1" },
        ],
        30
      )
    ).toBe(true);
  });

  it("permite horários sequenciais sem overlap", () => {
    expect(
      batchSlotsOverlap(
        [
          { date: futureDate, time: "10:00", staffId: "s1" },
          { date: futureDate, time: "10:30", staffId: "s1" },
        ],
        30
      )
    ).toBe(false);
  });

  it("permite mesmo horário com profissionais diferentes", () => {
    expect(
      batchSlotsOverlap(
        [
          { date: futureDate, time: "10:00", staffId: "s1" },
          { date: futureDate, time: "10:00", staffId: "s2" },
        ],
        30
      )
    ).toBe(false);
  });
});

describe("Pacotes pré-pagos", () => {
  let clients: MockSalonClientRepository;
  let catalog: MockServicePackageRepository;
  let sold: MockClientPackageRepository;
  let services: MockServiceRepository;
  let appointments: MockAppointmentRepository;

  beforeEach(async () => {
    clients = new MockSalonClientRepository();
    catalog = new MockServicePackageRepository();
    sold = new MockClientPackageRepository();
    services = new MockServiceRepository();
    appointments = new MockAppointmentRepository();

    await services.create({
      barbershopId: "shop-1",
      name: "Corte",
      price: 45,
      avgTimeMinutes: 30,
      icon: "scissors",
    });
  });

  async function seedClientAndPackage() {
    const createClient = new CreateSalonClientUseCase(clients);
    const client = await createClient.execute(
      {
        barbershopId: "shop-1",
        name: "Maria Silva",
        whatsapp: "11988887777",
      },
      owner("shop-1")
    );

    const svc = (await services.list("shop-1"))[0];
    const createPkg = new CreateServicePackageUseCase(catalog, services);
    const template = await createPkg.execute(
      {
        barbershopId: "shop-1",
        serviceId: svc.id,
        name: "Pacote 5 cortes",
        sessionCount: 5,
        price: 180,
        validityDays: 90,
      },
      owner("shop-1")
    );

    sold.seedClientMeta[client.id] = {
      name: client.name,
      whatsapp: client.whatsapp,
      serviceDurationMinutes: 30,
    };

    const sell = new SellClientPackageUseCase(catalog, clients, sold);
    const wallet = await sell.execute(
      {
        barbershopId: "shop-1",
        clientId: client.id,
        packageId: template.id,
        paymentMethod: "pix",
        soldById: "owner-1",
      },
      owner("shop-1")
    );

    return { client, template, wallet, svc };
  }

  it("cadastra cliente e busca por WhatsApp", async () => {
    const create = new CreateSalonClientUseCase(clients);
    const list = new ListSalonClientsUseCase(clients);
    await create.execute(
      { barbershopId: "shop-1", name: "Ana", whatsapp: "11911112222" },
      owner("shop-1")
    );
    const result = await list.execute(
      { barbershopId: "shop-1", page: 1, limit: 20, search: "11911112222" },
      ADMIN
    );
    expect(result.total).toBe(1);
    expect(result.data[0].name).toBe("Ana");
  });

  it("vende pacote com saldo igual ao número de sessões", async () => {
    const { wallet } = await seedClientAndPackage();
    expect(wallet.remainingSessions).toBe(5);
    expect(wallet.totalSessions).toBe(5);
    expect(wallet.status).toBe("ACTIVE");
    expect(wallet.expiresAt).not.toBeNull();
  });

  it("agenda lote no mesmo dia e debita créditos", async () => {
    const { wallet } = await seedClientAndPackage();
    const book = new BookClientPackageUseCase(sold, appointments);
    const created = await book.execute(
      wallet.id,
      [
        { date: futureDate, time: "10:00", staffId: "staff-1" },
        { date: futureDate, time: "10:30", staffId: "staff-1" },
        { date: futureDate, time: "11:00", staffId: "staff-1" },
      ],
      owner("shop-1")
    );

    expect(created).toHaveLength(3);
    const updated = await sold.findById(wallet.id);
    expect(updated?.remainingSessions).toBe(2);
    expect(created.every((a) => a.clientPackageId === wallet.id)).toBe(true);
  });

  it("rejeita lote com horários sobrepostos", async () => {
    const { wallet } = await seedClientAndPackage();
    const book = new BookClientPackageUseCase(sold, appointments);
    await expect(
      book.execute(
        wallet.id,
        [
          { date: futureDate, time: "10:00", staffId: "staff-1" },
          { date: futureDate, time: "10:15", staffId: "staff-1" },
        ],
        owner("shop-1")
      )
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("rejeita agendamento com saldo insuficiente", async () => {
    const { wallet } = await seedClientAndPackage();
    const book = new BookClientPackageUseCase(sold, appointments);
    await expect(
      book.execute(
        wallet.id,
        [
          { date: futureDate, time: "09:00" },
          { date: futureDate, time: "09:30" },
          { date: futureDate, time: "10:00" },
          { date: futureDate, time: "10:30" },
          { date: futureDate, time: "11:00" },
          { date: futureDate, time: "11:30" },
        ],
        owner("shop-1")
      )
    ).rejects.toBeInstanceOf(AppError);
  });

  it("rejeita uso de pacote expirado", async () => {
    const { wallet } = await seedClientAndPackage();
    const stored = await sold.findById(wallet.id);
    stored!.expiresAt = new Date(Date.now() - 1000);
    const consume = new ConsumeClientPackageUseCase(sold);
    await expect(consume.execute(wallet.id, owner("shop-1"))).rejects.toMatchObject({
      message: "Pacote expirado",
    });
  });

  it("walk-in consome 1 sessão sem criar agendamento", async () => {
    const { wallet } = await seedClientAndPackage();
    const consume = new ConsumeClientPackageUseCase(sold);
    const after = await consume.execute(wallet.id, owner("shop-1"));
    expect(after.remainingSessions).toBe(4);
    expect(appointments.appointments).toHaveLength(0);
  });

  it("restaura crédito ao cancelar agendamento CONFIRMED do pacote", async () => {
    const { wallet } = await seedClientAndPackage();
    const create = new CreateAppointmentUseCase(appointments, sold);
    const cancel = new CancelAppointmentUseCase(appointments, sold);

    const apt = await create.execute(
      {
        barbershopId: "shop-1",
        serviceId: wallet.serviceId,
        customerName: "Maria Silva",
        whatsapp: "11988887777",
        date: futureDate,
        time: "14:00",
        clientPackageId: wallet.id,
        clientId: wallet.clientId,
      },
      owner("shop-1")
    );

    expect((await sold.findById(wallet.id))?.remainingSessions).toBe(4);

    await cancel.execute(apt.id, owner("shop-1"));
    expect((await sold.findById(wallet.id))?.remainingSessions).toBe(5);
    expect((await sold.findById(wallet.id))?.status).toBe("ACTIVE");
  });

  it("não cancela venda se já houve sessão usada", async () => {
    const { wallet } = await seedClientAndPackage();
    const consume = new ConsumeClientPackageUseCase(sold);
    await consume.execute(wallet.id, owner("shop-1"));
    const cancelSale = new CancelClientPackageUseCase(sold);
    await expect(cancelSale.execute(wallet.id, owner("shop-1"))).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("cancela venda sem sessões usadas", async () => {
    const { wallet } = await seedClientAndPackage();
    const cancelSale = new CancelClientPackageUseCase(sold);
    const cancelled = await cancelSale.execute(wallet.id, owner("shop-1"));
    expect(cancelled.status).toBe("CANCELLED");
  });
});
