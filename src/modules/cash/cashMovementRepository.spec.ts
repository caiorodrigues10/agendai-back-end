/// <reference types="vitest/globals" />

const { findMany, queryRaw, shopFindUnique } = vi.hoisted(() => ({
  findMany: vi.fn(),
  queryRaw: vi.fn(),
  shopFindUnique: vi.fn(),
}));

vi.mock("@/libs/prismaClient", () => ({
  prisma: {
    cashMovement: {
      findMany: (...args: unknown[]) => findMany(...args),
      findUnique: (...args: unknown[]) => findMany(...args),
    },
    barbershop: { findUnique: (...args: unknown[]) => shopFindUnique(...args) },
    $queryRaw: (...args: unknown[]) => queryRaw(...args),
  },
}));

import { CashMovementRepository } from "./cashMovementRepository";
import { DEFAULT_SHOP_TIMEZONE, shopDateKey } from "@/modules/financial/ledger/shopTime";

/** Um dia de calendário cheio menos o último milissegundo (…23:59:59.999). */
const DAY_MS = 86_400_000;

const AT_NOON = new Date(2026, 8, 29, 15, 30);

describe("CashMovementRepository.list", () => {
  let repo: CashMovementRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    findMany.mockResolvedValue([]);
    shopFindUnique.mockResolvedValue({ timezone: DEFAULT_SHOP_TIMEZONE });
    repo = new CashMovementRepository();
  });

  it("desempata por id na ordenação por ocorrência", async () => {
    await repo.list("shop-1", {});

    const args = findMany.mock.calls[0][0] as {
      orderBy: Array<Record<string, string>>;
      where: Record<string, unknown>;
    };

    expect(args.orderBy).toEqual([{ occurredAt: "desc" }, { id: "desc" }]);
    expect(args.where).toEqual({ barbershopId: "shop-1" });
  });

  it("mantém o recorte diário usado pelo resumo de caixa", async () => {
    await repo.list("shop-1", { date: AT_NOON });

    const args = findMany.mock.calls[0][0] as {
      where: { occurredAt: { gte: Date; lte: Date } };
    };

    const { gte, lte } = args.where.occurredAt;
    expect(gte.getMilliseconds()).toBe(0);
    expect(lte.getMilliseconds()).toBe(999);
    expect(lte.getTime() - gte.getTime()).toBe(DAY_MS - 1);
    expect(gte.getTime()).toBeLessThan(lte.getTime());
    // O recorte é do dia de calendário pedido, interpretado no fuso do salão.
    expect(shopDateKey(gte, DEFAULT_SHOP_TIMEZONE)).toBe("2026-09-29");
    expect(shopDateKey(lte, DEFAULT_SHOP_TIMEZONE)).toBe("2026-09-29");
  });
});

describe("CashMovementRepository.getSummary", () => {
  let repo: CashMovementRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    findMany.mockResolvedValue([]);
    queryRaw.mockResolvedValue([]);
    shopFindUnique.mockResolvedValue({ timezone: DEFAULT_SHOP_TIMEZONE });
    repo = new CashMovementRepository();
  });

  it("agrega com entradas positivas e saídas negativas", async () => {
    findMany.mockResolvedValue([
      { paymentMethod: "CASH", type: "SERVICE_SALE", amount: 150 },
      { paymentMethod: "PIX", type: "EXPENSE", amount: 45.5 },
      { paymentMethod: "PIX", type: "TIP", amount: 10 },
    ]);

    const summary = await repo.getSummary("shop-1", AT_NOON);

    expect(summary).toEqual({
      summary: {
        CASH: { total: 150, count: 1 },
        PIX: { total: -35.5, count: 2 },
      },
      totalMovements: 3,
    });
    // A agregação saiu do SQL raw para o cliente.
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("mantém o recorte diário e o agrupamento por forma de pagamento", async () => {
    findMany.mockResolvedValue([
      { paymentMethod: "CASH", type: "SERVICE_SALE", amount: 10 },
      { paymentMethod: "CASH", type: "REFUND", amount: 4 },
    ]);

    const summary = await repo.getSummary("shop-1", AT_NOON);

    const args = findMany.mock.calls[0][0] as {
      where: { barbershopId: string; occurredAt: { gte: Date; lte: Date } };
    };
    const { gte, lte } = args.where.occurredAt;
    expect(args.where.barbershopId).toBe("shop-1");
    expect(gte.getMilliseconds()).toBe(0);
    expect(lte.getMilliseconds()).toBe(999);
    expect(lte.getTime() - gte.getTime()).toBe(DAY_MS - 1);
    expect(gte.getTime()).toBeLessThan(lte.getTime());
    expect(shopDateKey(gte, DEFAULT_SHOP_TIMEZONE)).toBe("2026-09-29");

    // REFUND não é entrada: +10 -4 = 6, ainda agrupado por CASH.
    expect(summary.summary.CASH).toEqual({ total: 6, count: 2 });
    expect(summary.totalMovements).toBe(2);
  });
});
