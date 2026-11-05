import { civilDayBounds } from "@/shared/utils/dateUtils";
import { describe, expect, it } from "vitest";
import type { Prisma } from "@prisma/client";
import type { IListCommissionsQuery } from "../dtos/ICommissionDTO";
import {
  buildCommissionListWhere,
  buildCommissionOrderBy,
} from "./commissionListWhere";

const SHOP = "barbershop-1";
const SP = "America/Sao_Paulo";

/** Mesma forma que o repositório repassa para o builder (paginação ignorada). */
const base: IListCommissionsQuery = { page: 1, limit: 20 };

/** `AND` do Prisma é `WhereInput | WhereInput[]`; aqui é sempre uma lista. */
const andClauses = (
  where: Prisma.CommissionEntryWhereInput,
): Prisma.CommissionEntryWhereInput[] =>
  (where.AND ?? []) as Prisma.CommissionEntryWhereInput[];

describe("modules/commissions — buildCommissionListWhere", () => {
  it("sem filtros: apenas o barbershopId do contexto", () => {
    expect(buildCommissionListWhere(SHOP, base)).toEqual({ barbershopId: SHOP });
  });

  it("o barbershopId vem sempre do contexto e não da query", () => {
    const where = buildCommissionListWhere(SHOP, {
      ...base,
      // @ts-expect-error — a query não tem campo de salão: não pode sobrepor o contexto
      barbershopId: "barbershop-2",
    });

    expect(where.barbershopId).toBe(SHOP);
    expect(JSON.stringify(where)).not.toContain("barbershop-2");
  });

  it("professionalId: uma cláusula própria, sempre junto do salão do contexto", () => {
    const where = buildCommissionListWhere(SHOP, {
      ...base,
      professionalId: "11111111-1111-1111-1111-111111111111",
    });

    expect(where).toEqual({
      barbershopId: SHOP,
      AND: [{ professionalId: "11111111-1111-1111-1111-111111111111" }],
    });
  });

  it("professionalId de outro salão: o salão do contexto permanece no where", () => {
    // O filtro alheio não substitui o escopo: a combinação salão A +
    // profissional do salão B não tem resultado (o teste de integração em
    // `tenantIsolation.integration.spec.ts` prova a lista vazia no Postgres).
    const where = buildCommissionListWhere(SHOP, {
      ...base,
      professionalId: "22222222-2222-2222-2222-222222222222",
    });

    expect(where.barbershopId).toBe(SHOP);
    expect(andClauses(where)).toEqual([
      { professionalId: "22222222-2222-2222-2222-222222222222" },
    ]);
  });

  it("serviceId: uma cláusula própria, sempre junto do salão do contexto", () => {
    const where = buildCommissionListWhere(SHOP, {
      ...base,
      serviceId: "33333333-3333-3333-3333-333333333333",
    });

    expect(where).toEqual({
      barbershopId: SHOP,
      AND: [{ serviceId: "33333333-3333-3333-3333-333333333333" }],
    });
  });

  it("serviceId de outro salão: o salão do contexto permanece no where", () => {
    const where = buildCommissionListWhere(SHOP, {
      ...base,
      serviceId: "44444444-4444-4444-4444-444444444444",
    });

    expect(where.barbershopId).toBe(SHOP);
    expect(andClauses(where)).toEqual([
      { serviceId: "44444444-4444-4444-4444-444444444444" },
    ]);
  });

  it("origin=QUEUE: comissão com origem na fila", () => {
    const where = buildCommissionListWhere(SHOP, { ...base, origin: "QUEUE" });

    expect(where.AND).toEqual([{ queueItemId: { not: null } }]);
  });

  it("origin=APPOINTMENT: comissão com origem na agenda", () => {
    const where = buildCommissionListWhere(SHOP, {
      ...base,
      origin: "APPOINTMENT",
    });

    expect(where.AND).toEqual([{ appointmentId: { not: null } }]);
  });

  it("from/to: filtram createdAt com limites do dia civil do salão e o último dia inteiro", () => {
    const where = buildCommissionListWhere(SHOP, {
      ...base,
      from: "2026-10-05",
      to: "2026-10-07",
      timeZone: SP,
    });

    expect(where.AND).toEqual([
      {
        createdAt: {
          gte: civilDayBounds("2026-10-05", SP).gte,
          // exclusivo no início do dia seguinte: o dia 07 entra inteiro
          lt: civilDayBounds("2026-10-07", SP).lt,
        },
      },
    ]);
  });

  it("from isolado: só limite inferior", () => {
    const where = buildCommissionListWhere(SHOP, {
      ...base,
      from: "2026-10-05",
      timeZone: SP,
    });

    expect(where.AND).toEqual([
      { createdAt: { gte: civilDayBounds("2026-10-05", SP).gte } },
    ]);
  });

  it("to isolado: limite exclusivo no início do dia seguinte", () => {
    const where = buildCommissionListWhere(SHOP, {
      ...base,
      to: "2026-10-05",
      timeZone: SP,
    });

    expect(where.AND).toEqual([
      { createdAt: { lt: civilDayBounds("2026-10-05", SP).lt } },
    ]);
  });

  it("sem fuso informado, usa o fuso padrão do salão", () => {
    const comFuso = buildCommissionListWhere(SHOP, { ...base, from: "2026-10-05" });
    const padrao = buildCommissionListWhere(SHOP, {
      ...base,
      from: "2026-10-05",
      timeZone: "America/Sao_Paulo",
    });

    expect(comFuso).toEqual(padrao);
  });

  it("evento às 22h locais do último dia ENTRA; 01h UTC do dia seguinte não", () => {
    const where = buildCommissionListWhere(SHOP, {
      ...base,
      from: "2026-10-05",
      to: "2026-10-05",
      timeZone: SP,
    });
    const clause = (
      andClauses(where)[0] as { createdAt: { gte: Date; lt: Date } }
    ).createdAt;

    // 2026-10-06T01:00Z = 2026-10-05 22:00 em São Paulo => dentro do dia 05
    const evento = new Date("2026-10-06T01:00:00.000Z");
    expect(evento.getTime()).toBeGreaterThanOrEqual(clause.gte.getTime());
    expect(evento.getTime()).toBeLessThan(clause.lt.getTime());

    // o dia 06 começa depois do evento (o evento é do dia 05)
    const dia06 = buildCommissionListWhere(SHOP, {
      ...base,
      from: "2026-10-06",
      timeZone: SP,
    });
    const limite06 = (
      andClauses(dia06)[0] as { createdAt: { gte: Date } }
    ).createdAt;
    expect(evento.getTime()).toBeLessThan(limite06.gte.getTime());
  });

  it("filtros combinados: cada um vira uma cláusula em AND", () => {
    const where = buildCommissionListWhere(SHOP, {
      ...base,
      professionalId: "11111111-1111-1111-1111-111111111111",
      serviceId: "33333333-3333-3333-3333-333333333333",
      origin: "QUEUE",
      from: "2026-10-05",
      to: "2026-10-07",
      timeZone: SP,
    });

    const clauses = andClauses(where);
    expect(where.barbershopId).toBe(SHOP);
    expect(clauses).toHaveLength(4);
    expect(clauses[0]).toEqual({
      professionalId: "11111111-1111-1111-1111-111111111111",
    });
    expect(clauses[1]).toEqual({
      serviceId: "33333333-3333-3333-3333-333333333333",
    });
    expect(clauses[2]).toEqual({ queueItemId: { not: null } });
    expect(clauses[3]).toMatchObject({ createdAt: expect.any(Object) });
    expect(where.OR).toBeUndefined();
  });
});

describe("modules/commissions — buildCommissionOrderBy", () => {
  it("sem sort: createdAt desc, id desc (ordenamento atual)", () => {
    expect(buildCommissionOrderBy(undefined)).toEqual([
      { createdAt: "desc" },
      { id: "desc" },
    ]);
  });

  it("data asc: desempate por id na mesma direção", () => {
    expect(buildCommissionOrderBy({ field: "data", dir: "asc" })).toEqual([
      { createdAt: "asc" },
      { id: "asc" },
    ]);
  });

  it("data desc: ordena pela coluna createdAt", () => {
    expect(buildCommissionOrderBy({ field: "data", dir: "desc" })).toEqual([
      { createdAt: "desc" },
      { id: "desc" },
    ]);
  });

  it("valor asc: ordena pela coluna amount", () => {
    expect(buildCommissionOrderBy({ field: "valor", dir: "asc" })).toEqual([
      { amount: "asc" },
      { id: "asc" },
    ]);
  });

  it("valor desc: desempate por id na mesma direção", () => {
    expect(buildCommissionOrderBy({ field: "valor", dir: "desc" })).toEqual([
      { amount: "desc" },
      { id: "desc" },
    ]);
  });
});
