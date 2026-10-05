/// <reference types="vitest/globals" />

const expenseAggregate = vi.fn();
const expenseGroupBy = vi.fn();
const expenseFindMany = vi.fn();
const fiadoFindMany = vi.fn();
const fiadoCount = vi.fn();
const packageAggregate = vi.fn();
const retailSaleAggregate = vi.fn();
const retailSaleFindMany = vi.fn();
const retailRefundAggregate = vi.fn();
const queryRaw = vi.fn();

vi.mock("@/libs/prismaClient", async () => {
  const { Prisma } = await vi.importActual<typeof import("@prisma/client")>("@prisma/client");
  return {
    Prisma,
    prisma: {
      expense: {
        aggregate: (...args: unknown[]) => expenseAggregate(...args),
        groupBy: (...args: unknown[]) => expenseGroupBy(...args),
        findMany: (...args: unknown[]) => expenseFindMany(...args),
      },
      fiado: {
        findMany: (...args: unknown[]) => fiadoFindMany(...args),
        count: (...args: unknown[]) => fiadoCount(...args),
      },
      clientPackage: { aggregate: (...args: unknown[]) => packageAggregate(...args) },
      retailSale: {
        aggregate: (...args: unknown[]) => retailSaleAggregate(...args),
        findMany: (...args: unknown[]) => retailSaleFindMany(...args),
      },
      retailSaleRefund: { aggregate: (...args: unknown[]) => retailRefundAggregate(...args) },
      $queryRaw: (...args: unknown[]) => queryRaw(...args),
    },
  };
});

import { BarbershopFinancialController } from "./BarbershopFinancialController";

type SummaryPayload = {
  success: boolean;
  data: {
    expenses: {
      total: number;
      totalPaid: number;
      totalPending: number;
      count: number;
      byType: Array<{ type: string; total: number; count: number }>;
    };
    fiados: {
      activeDebtors: number;
      totalOriginal: number;
      totalPaid: number;
      totalPending: number;
      overdueCount: number;
      overdueAmount: number;
    };
    packages: { count: number; totalPaid: number };
    products: {
      revenue: number;
      netRevenue: number;
      refunded: number;
      cogs: number;
      margin: number;
      saleCount: number;
      inventoryValue: number;
      lowStockCount: number;
      stockPurchases: number;
    };
  };
};

function rawText(arg: unknown): string {
  if (Array.isArray(arg)) return (arg as string[]).join("");
  return (arg as { strings: string[] }).strings.join("");
}

function makeRequest(query: Record<string, unknown> = {}) {
  return {
    user: { id: "user-1", role: "OWNER", barbershopId: "shop-1" },
    query,
  } as never;
}

async function renderSummary(query: Record<string, unknown> = {}): Promise<SummaryPayload> {
  const reply = { send: vi.fn() };
  await new BarbershopFinancialController().summary(makeRequest(query), reply as never);
  return reply.send.mock.calls[0][0] as SummaryPayload;
}

describe("BarbershopFinancialController.summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    expenseAggregate.mockImplementation((args: { where: { inventoryReceiptId: unknown; paidAt?: unknown } }) => {
      if (args.where.inventoryReceiptId !== null) return Promise.resolve({ _sum: { amount: 90 } });
      if (args.where.paidAt) return Promise.resolve({ _sum: { amount: 200 } });
      return Promise.resolve({ _sum: { amount: 300 }, _count: { _all: 4 } });
    });

    expenseGroupBy.mockResolvedValue([
      { type: "FIXED", _sum: { amount: 120 }, _count: { _all: 1 } },
      { type: "VARIABLE", _sum: { amount: 180 }, _count: { _all: 3 } },
    ]);
    packageAggregate.mockResolvedValue({ _count: { id: 3 }, _sum: { pricePaid: 450 } });
    retailSaleAggregate.mockResolvedValue({ _sum: { total: 1000 }, _count: { id: 10 } });
    retailRefundAggregate.mockResolvedValue({ _sum: { financialRefund: 50 } });
    retailSaleFindMany.mockResolvedValue([
      {
        lines: [
          { productId: "p1", productName: "Shampoo", quantity: 2, refundedQty: 0, unitPrice: 30, unitCost: 10 },
        ],
      },
    ]);
    queryRaw.mockImplementation((arg: unknown) => {
      const text = rawText(arg);
      if (text.includes("FROM fiados")) {
        return Promise.resolve([
          { totalDebtors: 2, totalOriginal: 500, totalPaid: 150, totalPending: 350, overdueCount: 1, overdueAmount: 80 },
        ]);
      }
      if (text.includes("FROM products")) return Promise.resolve([{ inventoryValue: 75, lowStockCount: 1 }]);
      return Promise.resolve([]);
    });
  });

  it("agrega no banco e devolve o resumo do caso de referência", async () => {
    const payload = await renderSummary();

    expect(payload.success).toBe(true);
    expect(payload.data).toEqual({
      expenses: {
        total: 300,
        totalPaid: 200,
        totalPending: 100,
        count: 4,
        byType: [
          { type: "FIXED", total: 120, count: 1 },
          { type: "VARIABLE", total: 180, count: 3 },
        ],
      },
      fiados: {
        activeDebtors: 2,
        totalOriginal: 500,
        totalPaid: 150,
        totalPending: 350,
        overdueCount: 1,
        overdueAmount: 80,
      },
      packages: { count: 3, totalPaid: 450 },
      products: {
        revenue: 1000,
        netRevenue: 950,
        refunded: 50,
        cogs: 20,
        margin: 930,
        saleCount: 10,
        inventoryValue: 75,
        lowStockCount: 1,
        stockPurchases: 90,
      },
    });
    expect(expenseFindMany).not.toHaveBeenCalled();
    expect(fiadoFindMany).not.toHaveBeenCalled();
    expect(fiadoCount).not.toHaveBeenCalled();
  });

  it("separa despesas operacionais de compras de estoque no where", async () => {
    await renderSummary();

    const wheres = expenseAggregate.mock.calls.map(
      (call) => (call[0] as { where: Record<string, unknown> }).where,
    );

    expect(wheres).toEqual([
      { barbershopId: "shop-1", inventoryReceiptId: null },
      { barbershopId: "shop-1", inventoryReceiptId: null, paidAt: { not: null } },
      { barbershopId: "shop-1", inventoryReceiptId: { not: null } },
    ]);
    expect((expenseGroupBy.mock.calls[0][0] as { where: Record<string, unknown> }).where).toEqual({
      barbershopId: "shop-1",
      inventoryReceiptId: null,
    });

    const [fiadoCall, inventoryCall] = queryRaw.mock.calls;
    expect(rawText(fiadoCall[0])).toContain("status IN ('PENDING', 'PARTIAL')");
    expect(rawText(inventoryCall[0])).toContain('FROM products');
    expect(fiadoCall.slice(1)).toEqual([expect.any(Date), expect.any(Date), "shop-1"]);
    expect(inventoryCall.slice(1)).toEqual(["shop-1"]);
  });

  it("aplica a janela from/to em expenses e packages", async () => {
    await renderSummary({ from: "2026-09-01T00:00:00.000Z", to: "2026-09-30T23:59:59.999Z" });

    const from = new Date("2026-09-01T00:00:00.000Z");
    const to = new Date("2026-09-30T23:59:59.999Z");
    const window = { gte: from, lte: to };

    const operationalWhere = (expenseAggregate.mock.calls[0][0] as { where: Record<string, unknown> }).where;
    const stockWhere = (expenseAggregate.mock.calls[2][0] as { where: Record<string, unknown> }).where;
    expect(operationalWhere.referenceDate).toEqual(window);
    expect(stockWhere.referenceDate).toEqual(window);

    const packageWhere = (packageAggregate.mock.calls[0][0] as { where: Record<string, unknown> }).where;
    expect(packageWhere.barbershopId).toBe("shop-1");
    expect(packageWhere.purchasedAt).toEqual(window);
  });
});
