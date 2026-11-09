/// <reference types="vitest/globals" />

const findMany = vi.fn();
const count = vi.fn();
const invitationFindMany = vi.fn();

vi.mock("@/libs/prismaClient", async () => {
  const { Prisma } = await vi.importActual<typeof import("@prisma/client")>("@prisma/client");
  return {
    Prisma,
    prisma: {
      user: {
        findMany: (...args: unknown[]) => findMany(...args),
        count: (...args: unknown[]) => count(...args),
      },
      internalInvitation: {
        findMany: (...args: unknown[]) => invitationFindMany(...args),
      },
    },
  };
});

import { AdminTeamRepository } from "./AdminTeamRepository";

describe("AdminTeamRepository.list", () => {
  let repo: AdminTeamRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);
    invitationFindMany.mockResolvedValue([]);
    repo = new AdminTeamRepository();
  });

  it("pagina com skip/take e conta o conjunto filtrado inteiro", async () => {
    count.mockResolvedValue(7);

    const result = await repo.list({ page: 3, limit: 25 });

    const args = findMany.mock.calls[0][0] as {
      skip: number;
      take: number;
      where: Record<string, unknown>;
    };
    expect(args.skip).toBe(50);
    expect(args.take).toBe(25);
    expect(args.where).toMatchObject({ role: "MASTER_ADMIN" });
    expect(count).toHaveBeenCalledWith({ where: args.where });
    expect(result.total).toBe(7);
  });

  it("ordena por createdAt desc com id de desempate quando não há sort", async () => {
    await repo.list({ page: 1, limit: 25 });

    const args = findMany.mock.calls[0][0] as {
      orderBy: Array<Record<string, string>>;
    };
    expect(args.orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
  });

  it("aplica o sort pedido (nome:asc)", async () => {
    await repo.list({ page: 1, limit: 25, sort: { field: "nome", dir: "asc" } });

    const args = findMany.mock.calls[0][0] as {
      orderBy: Array<Record<string, string>>;
    };
    expect(args.orderBy).toEqual([{ name: "asc" }, { id: "asc" }]);
  });

  it("o where da equipe interna nunca filtra por salão", async () => {
    await repo.list({ page: 1, limit: 25 });

    const args = findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(args.where).not.toHaveProperty("barbershopId");
  });

  it("com role, o escopo passa a ser o papel pedido", async () => {
    await repo.list({ page: 1, limit: 25, role: "EMPLOYEE" });

    const args = findMany.mock.calls[0][0] as {
      where: { role: string };
    };
    expect(args.where.role).toBe("EMPLOYEE");
  });

  it("os filtros entram no where como cláusulas separadas", async () => {
    await repo.list({
      page: 1,
      limit: 25,
      search: "Caio",
      status: "inactive",
    });

    const args = findMany.mock.calls[0][0] as {
      where: { AND: unknown[] };
    };
    expect(args.where.AND).toHaveLength(2);
  });

  it("o select não traz hash de senha, cpf, googleSub nem tokens", async () => {
    await repo.list({ page: 1, limit: 25 });

    const args = findMany.mock.calls[0][0] as {
      select: Record<string, unknown>;
    };
    expect(Object.keys(args.select).sort()).toEqual([
      "_count",
      "active",
      "avatarUrl",
      "createdAt",
      "email",
      "id",
      "name",
      "role",
      "updatedAt",
    ]);
    expect(args.select).not.toHaveProperty("password");
    expect(args.select).not.toHaveProperty("googleSub");
    expect(args.select).not.toHaveProperty("cpf");
    expect(args.select).not.toHaveProperty("deletedAt");
    expect(args.select).not.toHaveProperty("refreshTokens");
    expect(args.select).not.toHaveProperty("userSessions");
  });

  it("mapeia o registro do banco para o item da listagem", async () => {
    const record = {
      id: "internal-1",
      name: "Caio",
      email: "caio@agendai.com",
      role: "MASTER_ADMIN",
      active: true,
      avatarUrl: null,
      createdAt: new Date("2026-10-01T12:00:00.000Z"),
      updatedAt: new Date("2026-10-02T12:00:00.000Z"),
      _count: { ticketsAssigned: 2, tasksAssigned: 1 },
    };
    findMany.mockResolvedValue([record]);

    const result = await repo.list({ page: 1, limit: 25 });

    expect(result.users).toEqual([record]);
  });
});

describe("AdminTeamRepository.listInvitations", () => {
  let repo: AdminTeamRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    invitationFindMany.mockResolvedValue([]);
    repo = new AdminTeamRepository();
  });

  it("sem status: traz todos os convites (limite 20, como antes)", async () => {
    await repo.listInvitations();

    const args = invitationFindMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
      take: number;
    };
    expect(args.where).toEqual({});
    expect(args.take).toBe(20);
  });

  it("status=active: só convite pendente", async () => {
    await repo.listInvitations("active");

    const args = invitationFindMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(args.where).toEqual({ status: "PENDING" });
  });

  it("status=inactive: convite expirado ou revogado", async () => {
    await repo.listInvitations("inactive");

    const args = invitationFindMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(args.where).toEqual({ status: { in: ["EXPIRED", "REVOKED"] } });
  });

  it("o select do convite não traz o hash do token", async () => {
    await repo.listInvitations();

    const args = invitationFindMany.mock.calls[0][0] as {
      select: Record<string, unknown>;
    };
    expect(args.select).not.toHaveProperty("tokenHash");
    expect(args.select).not.toHaveProperty("invitedById");
  });
});
