import { describe, expect, it } from "vitest";
import type { Prisma } from "@prisma/client";
import type { IListServicesQuery } from "../dtos/IServiceListDTO";
import {
  buildServiceListOrderBy,
  buildServiceListWhere,
} from "./serviceListWhere";

const SHOP = "barbershop-1";

/** Mesma forma que o repositório repassa para o builder (paginação ignorada). */
const base: IListServicesQuery = { page: 1, limit: 20 };

describe("buildServiceListWhere", () => {
  it("sem filtros: visão pública exige publicBookable e o salão é o do contexto", () => {
    expect(buildServiceListWhere(SHOP, base)).toEqual({
      barbershopId: SHOP,
      AND: [{ publicBookable: true }],
    });
  });

  it("visão staff (includeInternal) não exige publicBookable", () => {
    expect(buildServiceListWhere(SHOP, base, { includeInternal: true })).toEqual({
      barbershopId: SHOP,
    });
  });

  it("ignora o barbershopId da query: o salão é o do contexto", () => {
    const where = buildServiceListWhere(SHOP, {
      // @ts-expect-error — barbershopId não é um filtro aceito.
      barbershopId: "barbershop-2",
    });

    expect(where.barbershopId).toBe(SHOP);
  });

  it("busca: uma cláusula de nome, sem diferenciar maiúsculas", () => {
    const where = buildServiceListWhere(SHOP, { ...base, search: "Corte" }, {
      includeInternal: true,
    });

    expect(where.AND).toEqual([
      { name: { contains: "Corte", mode: "insensitive" } },
    ]);
  });

  it("categoria e situação viram cláusulas separadas dentro do AND", () => {
    const where = buildServiceListWhere(
      SHOP,
      { ...base, categoryId: "category-1", active: false },
      { includeInternal: true },
    );

    expect(where.AND).toEqual([{ categoryId: "category-1" }, { active: false }]);
  });

  it("active=true filtra os ativos; active=undefined não filtra", () => {
    expect(
      buildServiceListWhere(SHOP, { ...base, active: true }, { includeInternal: true }).AND,
    ).toEqual([{ active: true }]);
    expect(
      buildServiceListWhere(SHOP, base, { includeInternal: true }).AND,
    ).toBeUndefined();
  });

  it("cada filtro vira sua própria cláusula (o AND não sobrescreve a busca)", () => {
    const where = buildServiceListWhere(
      SHOP,
      {
        ...base,
        search: "Corte",
        categoryId: "category-1",
        active: true,
      },
      { includeInternal: true },
    ) as Prisma.ServiceWhereInput;

    const and = where.AND as Prisma.ServiceWhereInput[];
    expect(and).toHaveLength(3);
    expect(and[0]).toEqual({ name: { contains: "Corte", mode: "insensitive" } });
    expect(and[1]).toEqual({ categoryId: "category-1" });
    expect(and[2]).toEqual({ active: true });  });

  it("visão pública: publicBookable entra como uma cláusula do AND", () => {
    const where = buildServiceListWhere(SHOP, { ...base, active: true });

    expect(where.AND).toEqual([{ publicBookable: true }, { active: true }]);
  });
});

describe("buildServiceListOrderBy", () => {
  it("sem sort: name asc (ordenamento atual) com id de desempate", () => {
    expect(buildServiceListOrderBy()).toEqual([
      { name: "asc" },
      { id: "asc" },
    ]);
  });

  it("cada campo da whitelist vira sua coluna, com id de desempate", () => {
    expect(buildServiceListOrderBy({ field: "nome", dir: "asc" })).toEqual([
      { name: "asc" },
      { id: "asc" },
    ]);
    expect(buildServiceListOrderBy({ field: "preco", dir: "desc" })).toEqual([
      { price: "desc" },
      { id: "desc" },
    ]);
    expect(buildServiceListOrderBy({ field: "duracao", dir: "asc" })).toEqual([
      { avgTimeMinutes: "asc" },
      { id: "asc" },
    ]);
    expect(buildServiceListOrderBy({ field: "criado", dir: "desc" })).toEqual([
      { createdAt: "desc" },
      { id: "desc" },
    ]);
  });

  it("campo desconhecido cai no ordenamento padrão", () => {
    expect(buildServiceListOrderBy({ field: "password", dir: "desc" })).toEqual([
      { name: "asc" },
      { id: "asc" },
    ]);
  });
});
