import { describe, expect, it } from "vitest";
import type { Prisma } from "@prisma/client";
import {
  buildAdminTeamListOrderBy,
  buildAdminTeamListWhere,
} from "./adminTeamListWhere";

describe("buildAdminTeamListWhere", () => {
  it("sem filtros: escopo é a equipe interna e o removido fica de fora", () => {
    expect(buildAdminTeamListWhere({})).toEqual({
      role: "MASTER_ADMIN",
      AND: [{ deletedAt: null }],
    });
  });

  it("com role: o escopo passa a ser o papel pedido (o admin vê mais que o dono)", () => {
    expect(buildAdminTeamListWhere({ role: "EMPLOYEE" })).toEqual({
      role: "EMPLOYEE",
      AND: [{ deletedAt: null }],
    });
  });

  it("busca: uma cláusula com OR de nome e e-mail, sem diferenciar maiúsculas", () => {
    const where = buildAdminTeamListWhere({ search: "Caio" });

    expect(where.AND).toEqual([
      {
        OR: [
          { name: { contains: "Caio", mode: "insensitive" } },
          { email: { contains: "Caio", mode: "insensitive" } },
        ],
      },
      { deletedAt: null },
    ]);
  });

  it("status=active: só ativo e não removido", () => {
    const where = buildAdminTeamListWhere({ status: "active" });

    expect(where.AND).toEqual([{ active: true, deletedAt: null }]);
  });

  it("status=inactive: desativado OU removido", () => {
    const where = buildAdminTeamListWhere({ status: "inactive" });

    expect(where.AND).toEqual([
      { OR: [{ active: false }, { deletedAt: { not: null } }] },
    ]);
  });

  it("active e status viram cláusulas separadas dentro do AND", () => {
    const where = buildAdminTeamListWhere({
      active: false,
      status: "inactive",
    });

    expect(where.AND).toEqual([
      { active: false },
      { OR: [{ active: false }, { deletedAt: { not: null } }] },
    ]);
  });

  it("cada filtro vira sua própria cláusula (o AND não sobrescreve o OR da busca)", () => {
    const where = buildAdminTeamListWhere({
      search: "Caio",
      role: "OWNER",
      active: true,
      status: "active",
    }) as Prisma.UserWhereInput;

    const and = where.AND as Prisma.UserWhereInput[];
    expect(and).toHaveLength(3);
    expect(and[0]).toHaveProperty("OR");
    expect(and[1]).toEqual({ active: true });
    expect(and[2]).toEqual({ active: true, deletedAt: null });
  });

  it("o where da equipe interna nunca filtra por salão", () => {
    const where = buildAdminTeamListWhere({});

    expect(where).not.toHaveProperty("barbershopId");
  });
});

describe("buildAdminTeamListOrderBy", () => {
  it("sem sort: createdAt desc (ordenamento atual da rota) com id de desempate", () => {
    expect(buildAdminTeamListOrderBy()).toEqual([
      { createdAt: "desc" },
      { id: "desc" },
    ]);
  });

  it("cada campo da whitelist vira sua coluna, com id de desempate", () => {
    expect(buildAdminTeamListOrderBy({ field: "nome", dir: "asc" })).toEqual([
      { name: "asc" },
      { id: "asc" },
    ]);
    expect(buildAdminTeamListOrderBy({ field: "email", dir: "desc" })).toEqual([
      { email: "desc" },
      { id: "desc" },
    ]);
    expect(buildAdminTeamListOrderBy({ field: "cargo", dir: "asc" })).toEqual([
      { role: "asc" },
      { id: "asc" },
    ]);
    expect(buildAdminTeamListOrderBy({ field: "criado", dir: "asc" })).toEqual([
      { createdAt: "asc" },
      { id: "asc" },
    ]);
  });

  it("campo desconhecido cai no ordenamento padrão da rota", () => {
    expect(buildAdminTeamListOrderBy({ field: "password", dir: "asc" })).toEqual([
      { createdAt: "desc" },
      { id: "desc" },
    ]);
  });
});
