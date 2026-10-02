/// <reference types="vitest/globals" />

const prismaMock = vi.hoisted(() => ({
  barbershop: { findUnique: vi.fn() },
  cashMovement: { findMany: vi.fn() },
  fiado: { findMany: vi.fn() },
  commissionEntry: { aggregate: vi.fn() },
  dailyCloseout: { upsert: vi.fn(), findUnique: vi.fn() },
}));

vi.mock("@/libs/prismaClient", () => ({ prisma: prismaMock, Prisma: {} }));

import { DailyCloseoutUseCases } from "./dailyCloseoutUseCases";

const day = new Date(2026, 9, 1); // 2026-10-01 (data de calendário local)

function setup(rows: any[], fiados: any[] = [], commissions = 30) {
  prismaMock.barbershop.findUnique.mockResolvedValue({ timezone: "America/Sao_Paulo" });
  prismaMock.cashMovement.findMany.mockResolvedValue(rows);
  prismaMock.fiado.findMany.mockResolvedValue(fiados);
  prismaMock.commissionEntry.aggregate.mockResolvedValue({ _sum: { amount: commissions } });
  prismaMock.dailyCloseout.findUnique.mockResolvedValue(null);
  prismaMock.dailyCloseout.upsert.mockImplementation((_args: any) =>
    Promise.resolve({ id: "close-1", ...(_args as any).create }),
  );
}

const row = (over: any = {}) => ({
  id: "m1",
  type: "SERVICE_SALE",
  amount: 100,
  paymentMethod: "CASH",
  occurredAt: new Date("2026-10-01T18:00:00Z"),
  sourceType: null,
  sourceId: null,
  ...over,
});

describe("DailyCloseoutUseCases — fonte única do fechamento", () => {
  beforeEach(() => vi.clearAllMocks());

  it("agrega caixa, receita, despesa e fiado a partir do ledger", async () => {
    setup(
      [
        row(), // 100 CASH
        row({ id: "m2", type: "EXPENSE", amount: 20, paymentMethod: "CASH" }),
        row({ id: "m3", type: "REFUND", amount: 10, paymentMethod: "CASH" }),
        row({ id: "m4", type: "FIADO_PAYMENT", amount: 50, paymentMethod: "PIX" }),
        row({ id: "m5", type: "PRODUCT_SALE", amount: 40, paymentMethod: "FIADO" }),
      ],
      [{ originalAmount: 40 }],
      30,
    );

    const useCases = new DailyCloseoutUseCases();
    await useCases.closeDay("shop-1", day, "user-1", { balanceOpen: 10, cashReceived: 75 });

    const data = prismaMock.dailyCloseout.upsert.mock.calls[0][0].create;
    expect(data.cashReceived).toBe(75); // declarado tem prioridade
    expect(data.pixReceived).toBe(50);
    expect(data.cardReceived).toBe(0);
    expect(data.expenses).toBe(20);
    expect(data.fiadoPaid).toBe(50); // pagamentos recebidos NO DIA
    expect(data.fiadoCreated).toBe(40);
    expect(data.productSales).toBe(40);
    expect(data.commissions).toBe(30);
    // discrepância calculada: contado (75) − (inicial 10 + líquido do ledger 70)
    expect(data.discrepancy).toBe(-5);
  });

  it("sem caixa declarado usa o líquido do ledger e não marca discrepância", async () => {
    setup([row(), row({ id: "m2", type: "EXPENSE", amount: 20, paymentMethod: "CASH" })]);

    const useCases = new DailyCloseoutUseCases();
    await useCases.closeDay("shop-1", day, "user-1", { balanceOpen: 0 });

    const data = prismaMock.dailyCloseout.upsert.mock.calls[0][0].create;
    expect(data.cashReceived).toBe(80);
    expect(data.discrepancy).toBeNull();
  });

  it("considera o fuso do salão nos limites do dia", async () => {
    prismaMock.barbershop.findUnique.mockResolvedValue({ timezone: "America/Sao_Paulo" });
    prismaMock.cashMovement.findMany.mockResolvedValue([]);
    prismaMock.fiado.findMany.mockResolvedValue([]);
    prismaMock.commissionEntry.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
    prismaMock.dailyCloseout.findUnique.mockResolvedValue(null);
    prismaMock.dailyCloseout.upsert.mockResolvedValue({});

    const useCases = new DailyCloseoutUseCases();
    await useCases.closeDay("shop-1", day, "user-1", { balanceOpen: 0 });

    const where = prismaMock.cashMovement.findMany.mock.calls[0][0].where;
    const { gte, lte } = where.occurredAt;
    // 2026-10-01 00:00 e 23:59:59.999 em America/Sao_Paulo (UTC−3)
    expect(gte.toISOString()).toBe("2026-10-01T03:00:00.000Z");
    expect(lte.toISOString()).toBe("2026-10-02T02:59:59.999Z");
  });

  it("GET devolve preview calculado sem gravar nada", async () => {
    setup([row(), row({ id: "m2", type: "EXPENSE", amount: 30, paymentMethod: "CASH" })]);

    const useCases = new DailyCloseoutUseCases();
    const preview = await useCases.getCloseout("shop-1", day);

    expect(preview.id).toBe("");
    expect(Number(preview.cashReceived)).toBe(70);
    expect(Number(preview.expenses)).toBe(30);
    expect(prismaMock.dailyCloseout.upsert).not.toHaveBeenCalled();
  });

  it("GET devolve o fechamento já salvo sem recalcular", async () => {
    setup([row()]);
    prismaMock.dailyCloseout.findUnique.mockResolvedValue({ id: "close-1", barbershopId: "shop-1" });

    const useCases = new DailyCloseoutUseCases();
    const saved = await useCases.getCloseout("shop-1", day);

    expect(saved.id).toBe("close-1");
    expect(prismaMock.cashMovement.findMany).not.toHaveBeenCalled();
  });
});
