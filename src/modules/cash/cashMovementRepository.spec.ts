/// <reference types="vitest/globals" />

const findMany = vi.fn();
const queryRaw = vi.fn();

vi.mock("@/libs/prismaClient", () => ({
  prisma: {
    cashMovement: { findMany: (...args: unknown[]) => findMany(...args) },
    $queryRaw: (...args: unknown[]) => queryRaw(...args),
  },
}));

import { CashMovementRepository } from "./cashMovementRepository";

describe("CashMovementRepository.list", () => {
  let repo: CashMovementRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    findMany.mockResolvedValue([]);
    repo = new CashMovementRepository();
  });

  it("desempata por id na ordenação por criação", async () => {
    await repo.list("shop-1", {});

    const args = findMany.mock.calls[0][0] as {
      orderBy: Array<Record<string, string>>;
      where: Record<string, unknown>;
    };

    expect(args.orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
    expect(args.where).toEqual({ barbershopId: "shop-1" });
  });

  it("mantém o recorte diário usado pelo resumo de caixa", async () => {
    await repo.list("shop-1", { date: new Date(2026, 8, 29, 15, 30) });

    const args = findMany.mock.calls[0][0] as { where: { createdAt: { gte: Date; lte: Date } } };

    expect(args.where.createdAt.gte.getHours()).toBe(0);
    expect(args.where.createdAt.lte.getHours()).toBe(23);
    expect(args.where.createdAt.lte.getMilliseconds()).toBe(999);
    expect(args.where.createdAt.gte.getTime()).toBeLessThan(args.where.createdAt.lte.getTime());
  });
});

describe("CashMovementRepository.getSummary", () => {
  let repo: CashMovementRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    findMany.mockResolvedValue([]);
    queryRaw.mockResolvedValue([]);
    repo = new CashMovementRepository();
  });

  it("agrega no banco com entradas positivas e saídas negativas", async () => {
    queryRaw.mockResolvedValue([
      { paymentMethod: "CASH", total: 150, count: 3 },
      { paymentMethod: "PIX", total: -45.5, count: 2 },
    ]);

    const summary = await repo.getSummary("shop-1", new Date(2026, 8, 29, 15, 30));

    expect(summary).toEqual({
      summary: {
        CASH: { total: 150, count: 3 },
        PIX: { total: -45.5, count: 2 },
      },
      totalMovements: 5,
    });
    expect(findMany).not.toHaveBeenCalled();
  });

  it("mantém o recorte diário e o agrupamento por forma de pagamento", async () => {
    queryRaw.mockResolvedValue([{ paymentMethod: "CASH", total: 10, count: 1 }]);

    await repo.getSummary("shop-1", new Date(2026, 8, 29, 15, 30));

    const call = queryRaw.mock.calls[0];
    const text = (call[0] as string[]).join("");
    expect(text).toContain('GROUP BY "paymentMethod"');
    expect(text).toContain("'SERVICE_SALE'");
    expect(text).toContain("ELSE -amount");

    const [shopId, start, end] = call.slice(1) as [string, Date, Date];
    expect(shopId).toBe("shop-1");
    expect(start.getHours()).toBe(0);
    expect(start.getMilliseconds()).toBe(0);
    expect(end.getHours()).toBe(23);
    expect(end.getMilliseconds()).toBe(999);
    expect(start.getTime()).toBeLessThan(end.getTime());
  });
});
