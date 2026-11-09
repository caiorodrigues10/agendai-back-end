/// <reference types="vitest/globals" />

const findMany = vi.fn();
const count = vi.fn();

vi.mock("@/libs/prismaClient", async () => {
  const { Prisma } = await vi.importActual<typeof import("@prisma/client")>("@prisma/client");
  return {
    Prisma,
    prisma: {
      user: {
        findMany: (...args: unknown[]) => findMany(...args),
        count: (...args: unknown[]) => count(...args),
      },
    },
  };
});

import { UserRepository } from "./UserRepository";

const SHOP = "barbershop-1";

describe("UserRepository.list", () => {
  let repo: UserRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);
    repo = new UserRepository();
  });

  it("pagina com skip/take e conta o conjunto filtrado inteiro", async () => {
    count.mockResolvedValue(37);

    const result = await repo.list(SHOP, { page: 3, limit: 10 });

    const args = findMany.mock.calls[0][0] as {
      skip: number;
      take: number;
      where: Record<string, unknown>;
    };
    expect(args.skip).toBe(20);
    expect(args.take).toBe(10);
    expect(args.where).toMatchObject({ barbershopId: SHOP, deletedAt: null });
    expect(count).toHaveBeenCalledWith({ where: args.where });
    expect(result.total).toBe(37);
  });

  it("ordena por createdAt asc com id de desempate quando não há sort", async () => {
    await repo.list(SHOP, { page: 1, limit: 20 });

    const args = findMany.mock.calls[0][0] as {
      orderBy: Array<Record<string, string>>;
    };
    expect(args.orderBy).toEqual([{ createdAt: "asc" }, { id: "asc" }]);
  });

  it("aplica o sort pedido (nome:asc)", async () => {
    await repo.list(SHOP, {
      page: 1,
      limit: 20,
      sort: { field: "nome", dir: "asc" },
    });

    const args = findMany.mock.calls[0][0] as {
      orderBy: Array<Record<string, string>>;
    };
    expect(args.orderBy).toEqual([{ name: "asc" }, { id: "asc" }]);
  });

  it("o select não traz hash de senha, tokens nem cpf", async () => {
    await repo.list(SHOP, { page: 1, limit: 20 });

    const args = findMany.mock.calls[0][0] as {
      select: Record<string, boolean>;
    };
    expect(Object.keys(args.select).sort()).toEqual([
      "active",
      "avatarUrl",
      "barbershopId",
      "createdAt",
      "email",
      "id",
      "name",
      "permissions",
      "role",
    ]);
    expect(args.select).not.toHaveProperty("password");
    expect(args.select).not.toHaveProperty("googleSub");
    expect(args.select).not.toHaveProperty("cpf");
    expect(args.select).not.toHaveProperty("deletedAt");
    expect(args.select).not.toHaveProperty("refreshTokens");
    expect(args.select).not.toHaveProperty("userSessions");
  });

  it("mapeia o registro do banco para o item da listagem", async () => {
    findMany.mockResolvedValue([
      {
        id: "user-1",
        name: "Ana",
        email: "ana@shop.com",
        role: "OWNER",
        active: true,
        barbershopId: SHOP,
        createdAt: new Date("2026-10-01T12:00:00.000Z"),
        avatarUrl: null,
        permissions: ["FINANCE_VIEW"],
      },
    ]);

    const result = await repo.list(SHOP, { page: 1, limit: 20 });

    expect(result.data).toEqual([
      {
        id: "user-1",
        name: "Ana",
        email: "ana@shop.com",
        role: "OWNER",
        active: true,
        barbershopId: SHOP,
        createdAt: new Date("2026-10-01T12:00:00.000Z"),
        avatarUrl: null,
        permissions: ["FINANCE_VIEW"],
      },
    ]);
  });

  it("os filtros entram no where como cláusulas separadas", async () => {
    await repo.list(SHOP, {
      page: 1,
      limit: 20,
      search: "Ana",
      role: "EMPLOYEE",
      active: true,
    });

    const args = findMany.mock.calls[0][0] as {
      where: { AND: unknown[] };
    };
    expect(args.where.AND).toHaveLength(3);
  });
});
