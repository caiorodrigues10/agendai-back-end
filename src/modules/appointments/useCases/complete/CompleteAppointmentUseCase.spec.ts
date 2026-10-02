/// <reference types="vitest/globals" />

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  cashMovement: {
    findFirst: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn(),
  },
}));

vi.mock("@/libs/prismaClient", () => ({ prisma: prismaMock, Prisma: { Decimal: class {
  constructor(public value: unknown) {}
} } }));

vi.mock("@/modules/crm/services/crmLedger", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/crm/services/crmLedger")>()),
  recordAppointmentCompletion: vi.fn().mockResolvedValue(undefined),
  recordFiadoCreated: vi.fn().mockResolvedValue(undefined),
}));

import { CompleteAppointmentUseCase } from "./CompleteAppointmentUseCase";
import { recordAppointmentCompletion, recordFiadoCreated } from "@/modules/crm/services/crmLedger";

type AppointmentRow = {
  id: string;
  barbershopId: string;
  serviceId: string;
  serviceName: string;
  servicePrice: number;
  staffId: string | null;
  clientId: string | null;
  clientPackageId: string | null;
  customerName: string;
  whatsapp: string;
  status: string;
};

function makeAppointment(overrides: Partial<AppointmentRow> = {}): AppointmentRow {
  return {
    id: "appt-1",
    barbershopId: "shop-1",
    serviceId: "svc-1",
    serviceName: "Corte",
    servicePrice: 80,
    staffId: "pro-1",
    clientId: "client-1",
    clientPackageId: null,
    customerName: "Ana",
    whatsapp: "11999999999",
    status: "CONFIRMED",
    ...overrides,
  };
}

function setup(appointment: AppointmentRow) {
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    commissionEntry: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    cashMovement: prismaMock.cashMovement,
    fiado: { create: vi.fn().mockResolvedValue({ id: "fiado-1" }) },
  };
  prismaMock.$transaction.mockReset().mockImplementation(async (fn: any) => fn(tx));
  prismaMock.cashMovement.findFirst.mockReset().mockResolvedValue(null);
  prismaMock.cashMovement.create.mockReset().mockResolvedValue({ id: "led-1" });

  const appointmentRepository = { findById: vi.fn().mockResolvedValue(appointment) };
  const completeService = {
    execute: vi.fn().mockResolvedValue({
      completionPrice: 80,
      resolvedSplits: [{ professionalId: "pro-1", percentage: 30 }],
      clientId: "client-1",
    }),
    notifyWhatsApp: vi.fn().mockResolvedValue(undefined),
  };
  const productCatalog = { createSale: vi.fn().mockResolvedValue(undefined) };

  const useCase = new CompleteAppointmentUseCase(
    appointmentRepository as never,
    completeService as never,
    productCatalog as never,
  );

  return { useCase, tx, appointmentRepository, completeService, productCatalog };
}

describe("CompleteAppointmentUseCase — conclusão alimenta comissão e ledger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(recordAppointmentCompletion).mockClear();
    vi.mocked(recordFiadoCreated).mockClear();
  });

  const request = {
    appointmentId: "appt-1",
    userId: "user-1",
    userRole: "OWNER",
    barbershopId: "shop-1",
    finalPrice: 80,
    paymentMethod: "pix",
    commissionSplits: [{ professionalId: "pro-1", percentage: 30 }],
  };

  it("persiste finalPrice/paymentMethod/completedAt/completedBy no Appointment", async () => {
    const { useCase, tx } = setup(makeAppointment());
    await useCase.execute(request);

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    const values = tx.$executeRaw.mock.calls[0].slice(1);
    expect(values).toContain(80); // finalPrice
    expect(values).toContain("pix"); // paymentMethod
    expect(values).toContain("user-1"); // completedBy
  });

  it("cria comissão de agenda com arredondamento em centavos (R$ 80 × 30% = R$ 24)", async () => {
    const { useCase, tx } = setup(makeAppointment());
    await useCase.execute(request);

    expect(tx.commissionEntry.createMany).toHaveBeenCalledTimes(1);
    const data = tx.commissionEntry.createMany.mock.calls[0][0].data;
    expect(data[0]).toMatchObject({
      appointmentId: "appt-1",
      serviceId: "svc-1",
      professionalId: "pro-1",
      percentage: 30,
      amount: 24,
    });
    expect(tx.commissionEntry.createMany.mock.calls[0][0].skipDuplicates).toBe(true);
  });

  it("gera SERVICE_SALE no ledger com chave idempotente e método PIX", async () => {
    const { useCase } = setup(makeAppointment());
    await useCase.execute(request);

    expect(prismaMock.cashMovement.create).toHaveBeenCalledTimes(1);
    const data = prismaMock.cashMovement.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      barbershopId: "shop-1",
      type: "SERVICE_SALE",
      paymentMethod: "PIX",
      sourceType: "APPOINTMENT",
      sourceId: "appt-1",
      professionalId: "pro-1",
      idempotencyKey: "shop-1:APPOINTMENT:appt-1:SERVICE_SALE",
    });
    expect(Number(data.amount)).toBe(80);
    expect(data.occurredAt).toBeInstanceOf(Date);
  });

  it("repetir a chamada não duplica (agendamento já concluído → 409)", async () => {
    const { useCase, appointmentRepository } = setup(makeAppointment({ status: "COMPLETED" }));

    await expect(useCase.execute(request)).rejects.toMatchObject({ statusCode: 409 });
    expect(appointmentRepository.findById).toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.cashMovement.create).not.toHaveBeenCalled();
  });

  it("corrida na conclusão (update não afeta nenhuma linha) → 409 e nada é gravado", async () => {
    const { useCase, tx } = setup(makeAppointment());
    tx.$executeRaw.mockResolvedValue(0);

    await expect(useCase.execute(request)).rejects.toMatchObject({ statusCode: 409 });
    expect(tx.commissionEntry.createMany).not.toHaveBeenCalled();
    expect(prismaMock.cashMovement.create).not.toHaveBeenCalled();
    expect(vi.mocked(recordAppointmentCompletion)).not.toHaveBeenCalled();
  });

  it("falha no ledger reverte a conclusão (erro propaga e pós-commit não roda)", async () => {
    const { useCase } = setup(makeAppointment());
    prismaMock.cashMovement.create.mockRejectedValue(new Error("ledger off"));

    await expect(useCase.execute(request)).rejects.toThrow("ledger off");
    expect(vi.mocked(recordAppointmentCompletion)).not.toHaveBeenCalled();
    expect(vi.mocked(recordFiadoCreated)).not.toHaveBeenCalled();
  });

  it("sessão de pacote não gera receita nova nem comissão", async () => {
    const { useCase, tx } = setup(makeAppointment({ clientPackageId: "pkg-1" }));
    await useCase.execute(request);

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1); // status persistido
    expect(tx.commissionEntry.createMany).not.toHaveBeenCalled();
    expect(prismaMock.cashMovement.create).not.toHaveBeenCalled();
    expect(tx.fiado.create).not.toHaveBeenCalled();
  });

  it("pagamento em fiado cria o fiado na transação e lança receita sem entrada de caixa", async () => {
    const { useCase, tx } = setup(makeAppointment());
    await useCase.execute({ ...request, paymentMethod: "fiado" });

    expect(tx.fiado.create).toHaveBeenCalledTimes(1);
    expect(tx.fiado.create.mock.calls[0][0].data).toMatchObject({
      barbershopId: "shop-1",
      originalAmount: 80,
      origin: "SERVICE_COMPLETION",
      status: "PENDING",
    });
    const data = prismaMock.cashMovement.create.mock.calls[0][0].data;
    expect(data.paymentMethod).toBe("FIADO"); // receita reconhecida, fora do caixa
    expect(vi.mocked(recordFiadoCreated)).toHaveBeenCalledWith("fiado-1");
  });

  it("conclui sem informar preço usando o preço do serviço e registra tudo", async () => {
    const { useCase, tx, completeService } = setup(makeAppointment({ servicePrice: 80 }));
    completeService.execute.mockResolvedValue({
      completionPrice: 80,
      resolvedSplits: [{ professionalId: "pro-1", percentage: 30 }],
      clientId: "client-1",
    });

    await useCase.execute({
      appointmentId: "appt-1",
      userId: "user-1",
      userRole: "OWNER",
      barbershopId: "shop-1",
    });

    expect(completeService.execute).toHaveBeenCalledWith(expect.objectContaining({
      sourceType: "APPOINTMENT",
      sourceId: "appt-1",
      skipSideEffects: true,
    }));
    expect(tx.commissionEntry.createMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.cashMovement.create).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordAppointmentCompletion)).toHaveBeenCalledWith("appt-1");
  });
});
