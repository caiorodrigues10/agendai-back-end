/// <reference types="vitest/globals" />

const holder = vi.hoisted(() => ({ tx: undefined as unknown }));
const rlsMock = vi.hoisted(() => vi.fn(async (fn: (tx: unknown) => unknown) => fn(holder.tx)));
vi.mock("@/libs/prismaExtensions", () => ({ rlsTransaction: rlsMock }));

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
  addons?: Array<{
    addonId: string;
    name: string;
    unitPrice: number;
    quantity: number;
    durationMinutes: number;
    commissionable: boolean;
  }>;
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
  prismaMock.$transaction.mockReset();
  holder.tx = tx;
  rlsMock.mockClear();
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
    expect(rlsMock).not.toHaveBeenCalled();
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

  describe("tabela de comissão e totals com adicionais", () => {
    type AddonCase = {
      name: string;
      basePrice: number;
      addons?: NonNullable<AppointmentRow["addons"]>;
      packageSession?: boolean;
      percentage: number;
      expectedFinalPrice: number;
      expectedLedger?: number;
      expectedFiado?: number;
      expectedCommission?: number;
      finalPriceOverride?: number;
    };

    const addon = (
      addonId: string,
      unitPrice: number,
      quantity = 1,
      commissionable = true
    ): NonNullable<AppointmentRow["addons"]>[number] => ({
      addonId,
      name: `Adicional ${addonId}`,
      unitPrice,
      quantity,
      durationMinutes: 30,
      commissionable,
    });

    const cases: AddonCase[] = [
      {
        name: "misto: comissionável + não comissionável",
        basePrice: 80,
        addons: [addon("a", 10), addon("b", 5, 1, false)],
        percentage: 30,
        expectedFinalPrice: 95,
        expectedLedger: 95,
        expectedFiado: 95,
        expectedCommission: 27,
      },
      {
        name: "quantidade maior que 1",
        basePrice: 80,
        addons: [addon("a", 10, 2)],
        percentage: 30,
        expectedFinalPrice: 100,
        expectedLedger: 100,
        expectedFiado: 100,
        expectedCommission: 30,
      },
      {
        name: "adicional com preço zero",
        basePrice: 80,
        addons: [addon("a", 0, 2)],
        percentage: 30,
        expectedFinalPrice: 80,
        expectedLedger: 80,
        expectedFiado: 80,
        expectedCommission: 24,
      },
      {
        name: "arredondamento em centavos",
        basePrice: 33.33,
        addons: [addon("a", 0.01)],
        percentage: 30,
        expectedFinalPrice: 33.34,
        expectedLedger: 33.34,
        expectedFiado: 33.34,
        expectedCommission: 10,
      },
      {
        name: "pacote sem adicional permanece idêntico",
        basePrice: 80,
        packageSession: true,
        percentage: 30,
        expectedFinalPrice: 80,
      },
      {
        name: "override do preço final não altera a base de comissão",
        basePrice: 80,
        addons: [addon("a", 10), addon("b", 5, 1, false)],
        percentage: 30,
        expectedFinalPrice: 100,
        expectedLedger: 100,
        expectedFiado: 100,
        expectedCommission: 27,
        finalPriceOverride: 100,
      },
      {
        name: "pacote sem adicional e com override registra só a parcela além da base",
        basePrice: 80,
        packageSession: true,
        percentage: 30,
        expectedFinalPrice: 90,
        expectedLedger: 10,
        expectedFiado: 10,
        finalPriceOverride: 90,
      },
      {
        name: "pacote com adicional usa override no ledger e snapshot na comissão",
        basePrice: 80,
        addons: [addon("a", 10)],
        packageSession: true,
        percentage: 30,
        expectedFinalPrice: 85,
        expectedLedger: 5,
        expectedFiado: 5,
        expectedCommission: 3,
        finalPriceOverride: 85,
      },
      {
        name: "pacote sem adicional e sem override preserva o resultado legado",
        basePrice: 80,
        packageSession: true,
        percentage: 30,
        expectedFinalPrice: 80,
      },

      {
        name: "pacote com adicional comissionável registra só a parcela do adicional",
        basePrice: 80,
        addons: [addon("a", 10)],
        packageSession: true,
        percentage: 30,
        expectedFinalPrice: 90,
        expectedLedger: 10,
        expectedFiado: 10,
        expectedCommission: 3,
      },
      {
        name: "pacote com adicional não comissionável não gera comissão",
        basePrice: 80,
        addons: [addon("a", 10, 1, false)],
        packageSession: true,
        percentage: 30,
        expectedFinalPrice: 90,
        expectedLedger: 10,
        expectedFiado: 10,
      },
      {
        name: "pacote com adicional não comissionável mantém override no ledger",
        basePrice: 80,
        addons: [addon("a", 10, 1, false)],
        packageSession: true,
        percentage: 30,
        expectedFinalPrice: 85,
        expectedLedger: 5,
        expectedFiado: 5,
        finalPriceOverride: 85,
      },
    ];

    for (const testCase of cases) {
      it(testCase.name, async () => {
        const { useCase, tx, completeService } = setup(
          makeAppointment({
            servicePrice: testCase.basePrice,
            clientPackageId: testCase.packageSession ? "pkg-1" : null,
            addons: testCase.addons,
          })
        );
        completeService.execute.mockImplementation(async (input) => ({
          completionPrice: input.finalPrice ?? testCase.basePrice,
          resolvedSplits: [
            { professionalId: "pro-1", percentage: testCase.percentage },
          ],
          clientId: "client-1",
        }));

        const result = await useCase.execute({
          appointmentId: "appt-1",
          userId: "user-1",
          userRole: "OWNER",
          barbershopId: "shop-1",
          paymentMethod: "fiado",
          commissionSplits: [
            { professionalId: "pro-1", percentage: testCase.percentage },
          ],
          ...(testCase.finalPriceOverride !== undefined
            ? { finalPrice: testCase.finalPriceOverride }
            : {}),
        });

        expect(result.finalPrice).toBe(testCase.expectedFinalPrice);
        expect(completeService.execute).toHaveBeenCalledWith(
          expect.objectContaining({ finalPrice: testCase.expectedFinalPrice })
        );

        if (testCase.expectedLedger === undefined) {
          expect(prismaMock.cashMovement.create).not.toHaveBeenCalled();
        } else {
          expect(prismaMock.cashMovement.create).toHaveBeenCalledTimes(1);
          expect(
            Number(prismaMock.cashMovement.create.mock.calls[0][0].data.amount)
          ).toBe(testCase.expectedLedger);
        }

        if (testCase.expectedFiado === undefined) {
          expect(tx.fiado.create).not.toHaveBeenCalled();
        } else {
          expect(tx.fiado.create).toHaveBeenCalledTimes(1);
          expect(tx.fiado.create.mock.calls[0][0].data.originalAmount).toBe(
            testCase.expectedFiado
          );
        }

        if (testCase.expectedCommission === undefined) {
          expect(tx.commissionEntry.createMany).not.toHaveBeenCalled();
        } else {
          expect(tx.commissionEntry.createMany).toHaveBeenCalledTimes(1);
          expect(tx.commissionEntry.createMany.mock.calls[0][0].data[0].amount).toBe(
            testCase.expectedCommission
          );
        }
      });
    }
  });
});
