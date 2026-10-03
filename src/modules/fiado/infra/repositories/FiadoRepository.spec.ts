/// <reference types="vitest/globals" />

const findMany = vi.fn();
const count = vi.fn();
const queryRaw = vi.fn();

vi.mock("@/libs/prismaClient", async () => {
  const { Prisma } = await vi.importActual<typeof import("@prisma/client")>("@prisma/client");
  return {
    Prisma,
    prisma: {
      fiado: {
        findMany: (...args: unknown[]) => findMany(...args),
        count: (...args: unknown[]) => count(...args),
      },
      $queryRaw: (...args: unknown[]) => queryRaw(...args),
    },
  };
});

import { FiadoRepository } from "./FiadoRepository";

describe("FiadoRepository.list", () => {
  let repo: FiadoRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);
    repo = new FiadoRepository();
  });

  it("desempata por id na ordenação por criação", async () => {
    await repo.list({ page: 4, limit: 10, barbershopId: "shop-1" });

    const args = findMany.mock.calls[0][0] as {
      orderBy: Array<Record<string, string>>;
      skip: number;
      take: number;
      where: Record<string, unknown>;
      include: { payments: { orderBy: Array<Record<string, string>> } };
    };

    expect(args.orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
    expect(args.include.payments.orderBy).toEqual([{ createdAt: "asc" }, { id: "asc" }]);
    expect(args.skip).toBe(30);
    expect(args.take).toBe(10);
    expect(args.where).toEqual({ barbershopId: "shop-1" });
    expect(count.mock.calls[0][0]).toEqual({ where: { barbershopId: "shop-1" } });
  });

  it("mantém o mesmo where entre findMany e count com filtro de status", async () => {
    await repo.list({ page: 1, limit: 5, barbershopId: "shop-1", status: "PENDING" });

    const listWhere = (findMany.mock.calls[0][0] as { where: Record<string, unknown> }).where;
    const countWhere = (count.mock.calls[0][0] as { where: Record<string, unknown> }).where;

    expect(listWhere).toEqual({ barbershopId: "shop-1", status: "PENDING" });
    expect(countWhere).toEqual(listWhere);
  });
});

describe("FiadoRepository.getSummary", () => {
  let repo: FiadoRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);
    queryRaw.mockResolvedValue([]);
    repo = new FiadoRepository();
  });

  it("agrega no banco e devolve o resumo do caso de referência", async () => {
    queryRaw.mockResolvedValue([
      {
        totalDebtors: 3,
        totalOriginal: 450,
        totalPaid: 150,
        totalPending: 300,
        overdueCount: 2,
        overdueAmount: 120,
      },
    ]);

    const summary = await repo.getSummary("shop-1");

    expect(summary).toEqual({
      totalDebtors: 3,
      totalPending: 300,
      totalOriginal: 450,
      totalPaid: 150,
      overdueCount: 2,
      overdueAmount: 120,
    });
    expect(findMany).not.toHaveBeenCalled();
    expect(count).not.toHaveBeenCalled();

    const call = queryRaw.mock.calls[0];
    const text = (call[0] as string[]).join("");
    expect(text).toContain("FROM fiados");
    expect(text).toContain("status IN ('PENDING', 'PARTIAL')");
    expect(text).toContain("GREATEST");

    const params = call.slice(1);
    expect(params[0]).toBeInstanceOf(Date);
    expect(params[1]).toEqual(params[0]);
    expect(params[2]).toBe("shop-1");
  });

  it("devolve zeros quando a consulta não retorna linha", async () => {
    const summary = await repo.getSummary("shop-1");

    expect(summary).toEqual({
      totalDebtors: 0,
      totalPending: 0,
      totalOriginal: 0,
      totalPaid: 0,
      overdueCount: 0,
      overdueAmount: 0,
    });
  });
});
