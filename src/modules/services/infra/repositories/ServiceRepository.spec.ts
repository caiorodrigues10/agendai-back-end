/// <reference types="vitest/globals" />

const findMany = vi.fn();
const count = vi.fn();

vi.mock("@/libs/prismaClient", async () => {
  const { Prisma } = await vi.importActual<typeof import("@prisma/client")>("@prisma/client");
  return {
    Prisma,
    prisma: {
      service: {
        findMany: (...args: unknown[]) => findMany(...args),
        count: (...args: unknown[]) => count(...args),
      },
    },
  };
});

import { ServiceRepository } from "./ServiceRepository";

const SHOP = "barbershop-1";

describe("ServiceRepository.listPaginated", () => {
  let repo: ServiceRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);
    repo = new ServiceRepository();
  });

  it("pagina com skip/take e conta o conjunto filtrado inteiro", async () => {
    count.mockResolvedValue(37);

    const result = await repo.listPaginated(SHOP, { page: 3, limit: 10 });

    const args = findMany.mock.calls[0][0] as {
      skip: number;
      take: number;
      where: Record<string, unknown>;
    };
    expect(args.skip).toBe(20);
    expect(args.take).toBe(10);
    expect(args.where).toMatchObject({ barbershopId: SHOP });
    expect(count).toHaveBeenCalledWith({ where: args.where });
    expect(result.total).toBe(37);
  });

  it("ordena por nome asc com id de desempate quando não há sort", async () => {
    await repo.listPaginated(SHOP, { page: 1, limit: 20 });

    const args = findMany.mock.calls[0][0] as {
      orderBy: Array<Record<string, string>>;
    };
    expect(args.orderBy).toEqual([{ name: "asc" }, { id: "asc" }]);
  });

  it("aplica o sort pedido (preco:desc)", async () => {
    await repo.listPaginated(SHOP, {
      page: 1,
      limit: 20,
      sort: { field: "preco", dir: "desc" },
    });

    const args = findMany.mock.calls[0][0] as {
      orderBy: Array<Record<string, string>>;
    };
    expect(args.orderBy).toEqual([{ price: "desc" }, { id: "desc" }]);
  });

  it("visão pública exige publicBookable; visão staff não", async () => {
    await repo.listPaginated(SHOP, { page: 1, limit: 20 });
    const publicArgs = findMany.mock.calls[0][0] as {
      where: { AND: unknown[] };
    };
    expect(publicArgs.where.AND).toEqual([{ publicBookable: true }]);

    await repo.listPaginated(
      SHOP,
      { page: 1, limit: 20 },
      { includeInternal: true },
    );
    const staffArgs = findMany.mock.calls[1][0] as {
      where: { AND?: unknown[] };
    };
    expect(staffArgs.where.AND).toBeUndefined();
  });

  it("os filtros entram no where como cláusulas separadas", async () => {
    await repo.listPaginated(
      SHOP,
      {
        page: 1,
        limit: 20,
        search: "Corte",
        categoryId: "category-1",
        active: true,
      },
      { includeInternal: true },
    );

    const args = findMany.mock.calls[0][0] as {
      where: { AND: unknown[] };
    };
    expect(args.where.AND).toHaveLength(3);
  });

  it("o select traz só os campos públicos do serviço", async () => {
    await repo.listPaginated(SHOP, { page: 1, limit: 20 });

    const args = findMany.mock.calls[0][0] as {
      select: Record<string, boolean>;
    };
    expect(Object.keys(args.select).sort()).toEqual([
      "active",
      "avgTimeMinutes",
      "barbershopId",
      "categoryId",
      "commissionPercent",
      "createdAt",
      "icon",
      "id",
      "name",
      "price",
      "publicBookable",
    ]);
  });

  it("mapeia o registro do banco para o item da listagem", async () => {
    const record = {
      id: "service-1",
      categoryId: "category-1",
      barbershopId: SHOP,
      name: "Corte",
      price: 40,
      avgTimeMinutes: 30,
      icon: "scissors",
      createdAt: new Date("2026-10-01T12:00:00.000Z"),
      active: true,
      commissionPercent: 10,
      publicBookable: true,
    };
    findMany.mockResolvedValue([record]);

    const result = await repo.listPaginated(SHOP, { page: 1, limit: 20 });

    expect(result.data).toEqual([record]);
  });
});
