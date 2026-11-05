import { civilDayBounds } from "@/shared/utils/dateUtils";
import { describe, expect, it } from "vitest";
import type { Prisma } from "@prisma/client";
import {
  buildFiadoListWhere,
  buildFiadoOrderBy,
} from "./fiadoListWhere";

const SHOP = "barbershop-1";

const base = { page: 1, limit: 20 };

/** `AND` do Prisma é `WhereInput | WhereInput[]`; aqui é sempre uma lista. */
const andClauses = (where: Prisma.FiadoWhereInput): Prisma.FiadoWhereInput[] =>
  (where.AND ?? []) as Prisma.FiadoWhereInput[];

describe("modules/fiado — buildFiadoListWhere", () => {
  it("sem filtros: apenas o barbershopId do contexto", () => {
    expect(buildFiadoListWhere(SHOP, base)).toEqual({ barbershopId: SHOP });
  });

  it("o barbershopId vem sempre do contexto e não da query", () => {
    const where = buildFiadoListWhere(SHOP, {
      ...base,
      // @ts-expect-error — a query não tem campo de salão: não pode sobrepor o contexto
      barbershopId: "barbershop-2",
    });

    expect(where.barbershopId).toBe(SHOP);
    expect(JSON.stringify(where)).not.toContain("barbershop-2");
  });

  it("status: uma cláusula própria com a lista de valores", () => {
    const where = buildFiadoListWhere(SHOP, {
      ...base,
      status: ["PENDING", "PARTIAL"],
    });

    expect(where).toEqual({
      barbershopId: SHOP,
      AND: [{ status: { in: ["PENDING", "PARTIAL"] } }],
    });
  });

  it("status: valor único vira lista de um elemento", () => {
    const where = buildFiadoListWhere(SHOP, { ...base, status: ["PAID"] });

    expect(where.AND).toEqual([{ status: { in: ["PAID"] } }]);
  });

  it("clientId: uma cláusula própria", () => {
    const where = buildFiadoListWhere(SHOP, {
      ...base,
      clientId: "client-uuid-1",
    });

    expect(where).toEqual({
      barbershopId: SHOP,
      AND: [{ clientId: "client-uuid-1" }],
    });
  });

  it("search: entra como cláusula em AND (nunca como OR na raiz)", () => {
    const where = buildFiadoListWhere(SHOP, { ...base, search: "João" });

    expect(where.OR).toBeUndefined();
    expect(where.AND).toEqual([
      {
        OR: [
          { customerName: { contains: "João", mode: "insensitive" } },
          { whatsapp: { contains: "João" } },
        ],
      },
    ]);
  });

  it("from/to: filtram createdAt com limites do dia civil do salão e o último dia inteiro", () => {
    const where = buildFiadoListWhere(SHOP, {
      ...base,
      from: "2026-10-05",
      to: "2026-10-07",
    });

    expect(where.AND).toEqual([
      {
        createdAt: {
          gte: civilDayBounds("2026-10-05").gte,
          // exclusivo no início do dia seguinte: o dia 07 entra inteiro
          lt: civilDayBounds("2026-10-07").lt,
        },
      },
    ]);
  });

  it("from isolado: só limite inferior", () => {
    const where = buildFiadoListWhere(SHOP, { ...base, from: "2026-10-05" });

    expect(where.AND).toEqual([
      { createdAt: { gte: civilDayBounds("2026-10-05").gte } },
    ]);
  });

  it("to isolado: limite exclusivo no início do dia seguinte", () => {
    const where = buildFiadoListWhere(SHOP, { ...base, to: "2026-10-05" });

    expect(where.AND).toEqual([
      { createdAt: { lt: civilDayBounds("2026-10-05").lt } },
    ]);
  });

  it("evento às 22h locais do último dia ENTRA; 01h UTC do dia seguinte não", () => {
    const where = buildFiadoListWhere(SHOP, {
      ...base,
      from: "2026-10-05",
      to: "2026-10-05",
    });
    const clause = (
      andClauses(where)[0] as { createdAt: { gte: Date; lt: Date } }
    ).createdAt;

    // 2026-10-06T01:00Z = 2026-10-05 22:00 em São Paulo → dentro do dia 05
    const evento = new Date("2026-10-06T01:00:00.000Z");
    expect(evento.getTime()).toBeGreaterThanOrEqual(clause.gte.getTime());
    expect(evento.getTime()).toBeLessThan(clause.lt.getTime());
  });

  it("dueFrom/dueTo: filtram dueDate, não createdAt", () => {
    const where = buildFiadoListWhere(SHOP, {
      ...base,
      dueFrom: "2026-10-01",
      dueTo: "2026-10-31",
    });

    expect(where.AND).toEqual([
      {
        dueDate: {
          gte: civilDayBounds("2026-10-01").gte,
          lt: civilDayBounds("2026-10-31").lt,
        },
      },
    ]);
  });

  it("from/to e dueFrom/dueTo convivem em cláusulas separadas", () => {
    const where = buildFiadoListWhere(SHOP, {
      ...base,
      from: "2026-10-05",
      to: "2026-10-07",
      dueFrom: "2026-11-01",
      dueTo: "2026-11-30",
    });

    expect(where.AND).toEqual([
      {
        createdAt: {
          gte: civilDayBounds("2026-10-05").gte,
          lt: civilDayBounds("2026-10-07").lt,
        },
      },
      {
        dueDate: {
          gte: civilDayBounds("2026-11-01").gte,
          lt: civilDayBounds("2026-11-30").lt,
        },
      },
    ]);
  });

  it("overdue: exige status em aberto e dueDate anterior ao momento", () => {
    const agora = new Date("2026-10-10T12:00:00.000Z");
    const where = buildFiadoListWhere(SHOP, { ...base, overdue: true }, agora);

    expect(where.AND).toEqual([
      { dueDate: { lt: new Date("2026-10-10T12:00:00.000Z") } },
      { status: { in: ["PENDING", "PARTIAL"] } },
    ]);
  });

  it("overdue com status na query: o status em aberto é sempre exigido", () => {
    const agora = new Date("2026-10-10T12:00:00.000Z");
    const where = buildFiadoListWhere(
      SHOP,
      { ...base, overdue: true, status: ["PENDING"] },
      agora
    );

    expect(where.AND).toEqual([
      { status: { in: ["PENDING"] } },
      { dueDate: { lt: new Date("2026-10-10T12:00:00.000Z") } },
      { status: { in: ["PENDING", "PARTIAL"] } },
    ]);
  });

  it("overdue com status incompatível (PAID): as cláusulas se anulam", () => {
    const agora = new Date("2026-10-10T12:00:00.000Z");
    const where = buildFiadoListWhere(
      SHOP,
      { ...base, overdue: true, status: ["PAID"] },
      agora
    );

    // `status in [PAID]` AND `status in [PENDING, PARTIAL]` => interseção vazia
    expect(where.AND).toEqual([
      { status: { in: ["PAID"] } },
      { dueDate: { lt: new Date("2026-10-10T12:00:00.000Z") } },
      { status: { in: ["PENDING", "PARTIAL"] } },
    ]);
  });

  it("search + overdue juntos: duas cláusulas em AND", () => {
    const agora = new Date("2026-10-10T12:00:00.000Z");
    const where = buildFiadoListWhere(
      SHOP,
      { ...base, overdue: true, search: "Ana" },
      agora
    );

    expect(where.AND).toEqual([
      { dueDate: { lt: new Date("2026-10-10T12:00:00.000Z") } },
      { status: { in: ["PENDING", "PARTIAL"] } },
      {
        OR: [
          { customerName: { contains: "Ana", mode: "insensitive" } },
          { whatsapp: { contains: "Ana" } },
        ],
      },
    ]);
    expect(where.OR).toBeUndefined();
  });

  it("filtros combinados: cada um vira uma cláusula em AND", () => {
    const agora = new Date("2026-10-10T12:00:00.000Z");
    const where = buildFiadoListWhere(
      SHOP,
      {
        ...base,
        status: ["PENDING", "PARTIAL"],
        clientId: "client-uuid-1",
        from: "2026-10-05",
        to: "2026-10-07",
        dueFrom: "2026-11-01",
        dueTo: "2026-11-30",
        overdue: true,
        search: "Ana",
      },
      agora
    );

    expect(where.barbershopId).toBe(SHOP);
    const clauses = andClauses(where);
    expect(clauses).toHaveLength(7);
    expect(clauses[0]).toEqual({ status: { in: ["PENDING", "PARTIAL"] } });
    expect(clauses[1]).toEqual({ clientId: "client-uuid-1" });
    expect(clauses[2]).toMatchObject({ createdAt: expect.any(Object) });
    expect(clauses[3]).toMatchObject({ dueDate: expect.any(Object) });
    expect(clauses[4]).toEqual({ dueDate: { lt: agora } });
    expect(clauses[5]).toEqual({ status: { in: ["PENDING", "PARTIAL"] } });
    expect(clauses[6]).toMatchObject({ OR: expect.any(Array) });
  });
});

describe("modules/fiado — buildFiadoOrderBy", () => {
  it("sem sort: createdAt desc, id desc (ordenamento atual)", () => {
    expect(buildFiadoOrderBy(undefined)).toEqual([
      { createdAt: "desc" },
      { id: "desc" },
    ]);
  });

  it("createdAt asc: desempate por id na mesma direção", () => {
    expect(buildFiadoOrderBy({ field: "createdAt", dir: "asc" })).toEqual([
      { createdAt: "asc" },
      { id: "asc" },
    ]);
  });

  it("amount mapeia para a coluna originalAmount", () => {
    expect(buildFiadoOrderBy({ field: "amount", dir: "desc" })).toEqual([
      { originalAmount: "desc" },
      { id: "desc" },
    ]);
  });

  it("dueDate: nulls last na ordem crescente", () => {
    expect(buildFiadoOrderBy({ field: "dueDate", dir: "asc" })).toEqual([
      { dueDate: { sort: "asc", nulls: "last" } },
      { id: "asc" },
    ]);
  });

  it("dueDate: nulls last também na ordem decrescente", () => {
    expect(buildFiadoOrderBy({ field: "dueDate", dir: "desc" })).toEqual([
      { dueDate: { sort: "desc", nulls: "last" } },
      { id: "desc" },
    ]);
  });
});
