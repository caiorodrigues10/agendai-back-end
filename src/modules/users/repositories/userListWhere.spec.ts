import { describe, expect, it } from "vitest";
import type { Prisma } from "@prisma/client";
import type { IListTeamQuery } from "../dtos/IUserListDTO";
import {
  buildUserListOrderBy,
  buildUserListWhere,
} from "./userListWhere";

const SHOP = "barbershop-1";

/** Mesma forma que o repositório repassa para o builder (paginação ignorada). */
const base: IListTeamQuery = { page: 1, limit: 20 };

describe("buildUserListWhere", () => {
  it("sem filtros: só o salão do contexto e sem membro removido", () => {
    expect(buildUserListWhere(SHOP, base)).toEqual({
      barbershopId: SHOP,
      deletedAt: null,
    });
  });

  it("ignora o barbershopId da query: o salão é o do contexto", () => {
    const where = buildUserListWhere(SHOP, {
      // @ts-expect-error — barbershopId não é um filtro aceito.
      barbershopId: "barbershop-2",
    });

    expect(where.barbershopId).toBe(SHOP);
  });

  it("busca: uma cláusula com OR de nome e e-mail, sem diferenciar maiúsculas", () => {
    const where = buildUserListWhere(SHOP, { ...base, search: "Ana" });

    expect(where.AND).toEqual([
      {
        OR: [
          { name: { contains: "Ana", mode: "insensitive" } },
          { email: { contains: "Ana", mode: "insensitive" } },
        ],
      },
    ]);
  });

  it("papel e situação viram cláusulas separadas dentro do AND", () => {
    const where = buildUserListWhere(SHOP, {
      ...base,
      role: "OWNER",
      active: false,
    });

    expect(where.AND).toEqual([{ role: "OWNER" }, { active: false }]);
  });

  it("active=true filtra os ativos; active=undefined não filtra", () => {
    expect(
      buildUserListWhere(SHOP, { ...base, active: true }).AND,
    ).toEqual([{ active: true }]);
    expect(buildUserListWhere(SHOP, base).AND).toBeUndefined();
  });

  it("cada filtro vira sua própria cláusula (o AND não sobrescreve o OR da busca)", () => {
    const where = buildUserListWhere(SHOP, {
      ...base,
      search: "Ana",
      role: "EMPLOYEE",
      active: true,
    }) as Prisma.UserWhereInput;

    const and = where.AND as Prisma.UserWhereInput[];
    expect(and).toHaveLength(3);
    expect(and[0]).toHaveProperty("OR");
    expect(and[1]).toEqual({ role: "EMPLOYEE" });
    expect(and[2]).toEqual({ active: true });
  });
});

describe("buildUserListOrderBy", () => {
  it("sem sort: createdAt asc (ordenamento atual) com id de desempate", () => {
    expect(buildUserListOrderBy()).toEqual([
      { createdAt: "asc" },
      { id: "asc" },
    ]);
  });

  it("cada campo da whitelist vira sua coluna, com id de desempate", () => {
    expect(buildUserListOrderBy({ field: "nome", dir: "asc" })).toEqual([
      { name: "asc" },
      { id: "asc" },
    ]);
    expect(buildUserListOrderBy({ field: "email", dir: "desc" })).toEqual([
      { email: "desc" },
      { id: "desc" },
    ]);
    expect(buildUserListOrderBy({ field: "cargo", dir: "asc" })).toEqual([
      { role: "asc" },
      { id: "asc" },
    ]);
    expect(buildUserListOrderBy({ field: "criado", dir: "desc" })).toEqual([
      { createdAt: "desc" },
      { id: "desc" },
    ]);
  });

  it("campo desconhecido cai no ordenamento padrão", () => {
    expect(buildUserListOrderBy({ field: "password", dir: "desc" })).toEqual([
      { createdAt: "asc" },
      { id: "asc" },
    ]);
  });
});
