/// <reference types="vitest/globals" />

const findMany = vi.fn();
const count = vi.fn();
const aggregate = vi.fn();
const groupBy = vi.fn();
const categoryFindMany = vi.fn();
const queryRaw = vi.fn();

vi.mock("@/libs/prismaClient", async () => {
  const { Prisma } = await vi.importActual<typeof import("@prisma/client")>("@prisma/client");
  return {
    Prisma,
    prisma: {
      expense: {
        findMany: (...args: unknown[]) => findMany(...args),
        count: (...args: unknown[]) => count(...args),
        aggregate: (...args: unknown[]) => aggregate(...args),
        groupBy: (...args: unknown[]) => groupBy(...args),
      },
      expenseCategory: {
        findMany: (...args: unknown[]) => categoryFindMany(...args),
      },
      $queryRaw: (...args: unknown[]) => queryRaw(...args),
    },
  };
});

import { ExpenseRepository } from "./ExpenseRepository";

type RawCall = { strings: string[]; values: unknown[] };

describe("ExpenseRepository.list", () => {
  let repo: ExpenseRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);
    repo = new ExpenseRepository();
  });

  it("desempata por id na ordenação por referenceDate", async () => {
    await repo.list({ page: 1, limit: 15, barbershopId: "shop-1" });

    const args = findMany.mock.calls[0][0] as {
      orderBy: Array<Record<string, string>>;
      skip: number;
      take: number;
      where: Record<string, unknown>;
    };

    expect(args.orderBy).toEqual([{ referenceDate: "desc" }, { id: "desc" }]);
    expect(args.skip).toBe(0);
    expect(args.take).toBe(15);
    expect(args.where).toEqual({ barbershopId: "shop-1" });
    expect(count.mock.calls[0][0]).toEqual({ where: { barbershopId: "shop-1" } });
  });

  it("aplica a janela de referenceDate no findMany e no count", async () => {
    const from = new Date("2026-09-01T00:00:00.000Z");
    const to = new Date("2026-09-30T23:59:59.999Z");

    await repo.list({ page: 1, limit: 10, barbershopId: "shop-1", from, to });

    const listWhere = (findMany.mock.calls[0][0] as { where: Record<string, unknown> }).where;
    const countWhere = (count.mock.calls[0][0] as { where: Record<string, unknown> }).where;

    expect(listWhere.referenceDate).toEqual({ gte: from, lte: to });
    expect(countWhere.referenceDate).toEqual({ gte: from, lte: to });
  });
});

describe("ExpenseRepository.getSummary", () => {
  let repo: ExpenseRepository;

  const from = new Date("2026-01-01T00:00:00.000Z");
  const to = new Date("2026-02-28T23:59:59.999Z");
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  beforeEach(() => {
    vi.clearAllMocks();
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);
    aggregate.mockResolvedValue({ _sum: { amount: 0 } });
    groupBy.mockResolvedValue([]);
    categoryFindMany.mockResolvedValue([]);
    queryRaw.mockResolvedValue([]);
    repo = new ExpenseRepository();
  });

  it("agrega no banco e devolve o resumo do caso de referência", async () => {
    aggregate
      .mockResolvedValueOnce({ _sum: { amount: 180 } })
      .mockResolvedValueOnce({ _sum: { amount: 130 } });
    groupBy
      .mockResolvedValueOnce([
        { type: "FIXED", _sum: { amount: 100 }, _count: { _all: 1 } },
        { type: "VARIABLE", _sum: { amount: 80 }, _count: { _all: 2 } },
      ])
      .mockResolvedValueOnce([
        { categoryId: "cat-1", _sum: { amount: 150 }, _count: { _all: 2 } },
        { categoryId: null, _sum: { amount: 30 }, _count: { _all: 1 } },
      ]);
    queryRaw.mockResolvedValue([
      { month: "2026-01", total: 150, count: 2 },
      { month: "2026-02", total: 30, count: 1 },
    ]);
    categoryFindMany.mockResolvedValue([{ id: "cat-1", name: "Aluguel" }]);

    const summary = await repo.getSummary("shop-1", from, to);

    expect(summary).toEqual({
      totalAmount: 180,
      totalPaid: 130,
      totalPending: 50,
      byCategory: [
        { categoryId: "cat-1", categoryName: "Aluguel", total: 150, count: 2 },
        { categoryId: null, categoryName: null, total: 30, count: 1 },
      ],
      byType: [
        { type: "FIXED", total: 100, count: 1 },
        { type: "VARIABLE", total: 80, count: 2 },
      ],
      byMonth: [
        { month: "2026-01", total: 150, count: 2 },
        { month: "2026-02", total: 30, count: 1 },
      ],
    });
    expect(findMany).not.toHaveBeenCalled();
  });

  it("replica o mesmo recorte de período em todas as consultas", async () => {
    groupBy.mockResolvedValue([
      { categoryId: "cat-1", _sum: { amount: 150 }, _count: { _all: 2 } },
    ]);

    await repo.getSummary("shop-1", from, to);

    const window = { gte: from, lte: to };
    expect((aggregate.mock.calls[0][0] as { where: unknown }).where).toEqual({
      barbershopId: "shop-1",
      referenceDate: window,
    });
    expect((aggregate.mock.calls[1][0] as { where: unknown }).where).toEqual({
      barbershopId: "shop-1",
      referenceDate: window,
      paidAt: { not: null },
    });
    expect((groupBy.mock.calls[0][0] as { by: string[] }).by).toEqual(["type"]);
    expect((groupBy.mock.calls[1][0] as { by: string[] }).by).toEqual(["categoryId"]);
    expect(categoryFindMany.mock.calls[0][0]).toEqual({
      where: { id: { in: ["cat-1"] } },
      select: { id: true, name: true },
    });

    const raw = queryRaw.mock.calls[0][0] as RawCall;
    expect(raw.strings.join("")).toContain("GROUP BY month");
    expect(raw.values).toEqual([timeZone, "shop-1", from, to]);
  });

  it("omite o recorte de período quando não há from/to", async () => {
    await repo.getSummary("shop-1");

    expect((aggregate.mock.calls[0][0] as { where: unknown }).where).toEqual({ barbershopId: "shop-1" });
    expect((groupBy.mock.calls[0][0] as { where: unknown }).where).toEqual({ barbershopId: "shop-1" });

    const raw = queryRaw.mock.calls[0][0] as RawCall;
    expect(raw.values).toEqual([timeZone, "shop-1"]);
    expect(categoryFindMany).not.toHaveBeenCalled();
    expect(findMany).not.toHaveBeenCalled();
  });
});
