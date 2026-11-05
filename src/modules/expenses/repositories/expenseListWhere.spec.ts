import { describe, expect, it } from "vitest";
import type { Prisma } from "@prisma/client";
import {
  buildExpenseListWhere,
  buildExpenseOrderBy,
} from "./expenseListWhere";

const SHOP = "barbershop-1";

const base = { page: 1, limit: 20 };

/** `AND` do Prisma é `WhereInput | WhereInput[]`; aqui é sempre uma lista. */
const andClauses = (where: Prisma.ExpenseWhereInput): Prisma.ExpenseWhereInput[] =>
  (where.AND ?? []) as Prisma.ExpenseWhereInput[];

describe("modules/expenses — buildExpenseListWhere", () => {
  it("sem filtros: apenas o barbershopId do contexto", () => {
    expect(buildExpenseListWhere(SHOP, base)).toEqual({ barbershopId: SHOP });
  });

  it("o barbershopId vem sempre do contexto e não da query", () => {
    const where = buildExpenseListWhere(SHOP, {
      ...base,
      // @ts-expect-error — a query não tem campo de salão: não pode sobrepor o contexto
      barbershopId: "barbershop-2",
    });

    expect(where.barbershopId).toBe(SHOP);
    expect(JSON.stringify(where)).not.toContain("barbershop-2");
  });

  it("categoryId: uma cláusula própria", () => {
    const where = buildExpenseListWhere(SHOP, {
      ...base,
      categoryId: "cat-uuid-1",
    });

    expect(where).toEqual({
      barbershopId: SHOP,
      AND: [{ categoryId: "cat-uuid-1" }],
    });
  });

  it("type: uma cláusula própria com o enum do schema", () => {
    const where = buildExpenseListWhere(SHOP, { ...base, type: "FIXED" });

    expect(where.AND).toEqual([{ type: "FIXED" }]);
  });

  it("recurrence: uma cláusula própria", () => {
    const where = buildExpenseListWhere(SHOP, { ...base, recurrence: "MONTHLY" });

    expect(where.AND).toEqual([{ recurrence: "MONTHLY" }]);
  });

  it("paymentMethod: igualdade sem diferenciar maiúsculas", () => {
    const where = buildExpenseListWhere(SHOP, {
      ...base,
      paymentMethod: "PIX",
    });

    expect(where.AND).toEqual([
      { paymentMethod: { equals: "PIX", mode: "insensitive" } },
    ]);
  });

  it("payment=paid: paidAt não nulo", () => {
    const where = buildExpenseListWhere(SHOP, {
      ...base,
      payment: ["paid"],
    });

    expect(where.AND).toEqual([{ paidAt: { not: null } }]);
  });

  it("payment=pending: paidAt nulo (inclui as vencidas)", () => {
    const where = buildExpenseListWhere(SHOP, {
      ...base,
      payment: ["pending"],
    });

    expect(where.AND).toEqual([{ paidAt: null }]);
  });

  it("payment=overdue: não paga e vencida (comparação estrita)", () => {
    const agora = new Date("2026-10-10T12:00:00.000Z");
    const where = buildExpenseListWhere(
      SHOP,
      { ...base, payment: ["overdue"] },
      agora
    );

    expect(where.AND).toEqual([
      { paidAt: null },
      { dueDate: { lt: new Date("2026-10-10T12:00:00.000Z") } },
    ]);
  });

  it("payment=overdue nunca vaza despesas pagas", () => {
    const agora = new Date("2026-10-10T12:00:00.000Z");
    const where = buildExpenseListWhere(
      SHOP,
      { ...base, payment: ["overdue"] },
      agora
    );

    // O `paidAt IS NULL` é obrigatório: sem ele, uma despesa paga e vencida
    // entraria no resultado.
    expect(where.AND).toContainEqual({ paidAt: null });
    expect(where.AND).toContainEqual({
      dueDate: { lt: new Date("2026-10-10T12:00:00.000Z") },
    });
  });

  it("payment=pending,overdue: interseção (overdue ⊂ pending)", () => {
    const agora = new Date("2026-10-10T12:00:00.000Z");
    const where = buildExpenseListWhere(
      SHOP,
      { ...base, payment: ["pending", "overdue"] },
      agora
    );

    expect(where.AND).toEqual([
      { paidAt: null },
      { paidAt: null },
      { dueDate: { lt: new Date("2026-10-10T12:00:00.000Z") } },
    ]);
  });

  it("payment=paid,overdue: as cláusulas se anulam (paid x não paga)", () => {
    const agora = new Date("2026-10-10T12:00:00.000Z");
    const where = buildExpenseListWhere(
      SHOP,
      { ...base, payment: ["paid", "overdue"] },
      agora
    );

    expect(where.AND).toEqual([
      { paidAt: { not: null } },
      { paidAt: null },
      { dueDate: { lt: new Date("2026-10-10T12:00:00.000Z") } },
    ]);
  });

  it("paid legado: true equivale a payment=paid", () => {
    const where = buildExpenseListWhere(SHOP, { ...base, paid: true });

    expect(where.AND).toEqual([{ paidAt: { not: null } }]);
  });

  it("paid legado: false equivale a payment=pending", () => {
    const where = buildExpenseListWhere(SHOP, { ...base, paid: false });

    expect(where.AND).toEqual([{ paidAt: null }]);
  });

  it("from/to: filtram referenceDate com limites UTC e o último dia inteiro", () => {
    const where = buildExpenseListWhere(SHOP, {
      ...base,
      from: "2026-10-05",
      to: "2026-10-07",
    });

    expect(where.AND).toEqual([
      {
        referenceDate: {
          gte: new Date("2026-10-05T00:00:00.000Z"),
          // exclusivo no início do dia seguinte: o dia 07 entra inteiro
          lt: new Date("2026-10-08T00:00:00.000Z"),
        },
      },
    ]);
  });

  it("from isolado: só limite inferior", () => {
    const where = buildExpenseListWhere(SHOP, { ...base, from: "2026-10-05" });

    expect(where.AND).toEqual([
      { referenceDate: { gte: new Date("2026-10-05T00:00:00.000Z") } },
    ]);
  });

  it("to isolado: limite exclusivo no início do dia seguinte", () => {
    const where = buildExpenseListWhere(SHOP, { ...base, to: "2026-10-05" });

    expect(where.AND).toEqual([
      { referenceDate: { lt: new Date("2026-10-06T00:00:00.000Z") } },
    ]);
  });

  it("search: entra como cláusula em AND (nunca como OR na raiz)", () => {
    const where = buildExpenseListWhere(SHOP, { ...base, search: "Aluguel" });

    expect(where.OR).toBeUndefined();
    expect(where.AND).toEqual([
      {
        OR: [
          { title: { contains: "Aluguel", mode: "insensitive" } },
          { supplierName: { contains: "Aluguel", mode: "insensitive" } },
          { notes: { contains: "Aluguel", mode: "insensitive" } },
        ],
      },
    ]);
  });

  it("search + payment: duas cláusulas em AND", () => {
    const agora = new Date("2026-10-10T12:00:00.000Z");
    const where = buildExpenseListWhere(
      SHOP,
      { ...base, search: "Aluguel", payment: ["pending"] },
      agora
    );

    expect(andClauses(where)).toHaveLength(2);
    expect(where.AND).toContainEqual({ paidAt: null });
    expect(where.OR).toBeUndefined();
  });

  it("filtros combinados: cada um vira uma cláusula em AND", () => {
    const agora = new Date("2026-10-10T12:00:00.000Z");
    const where = buildExpenseListWhere(
      SHOP,
      {
        ...base,
        categoryId: "cat-uuid-1",
        type: "FIXED",
        recurrence: "MONTHLY",
        paymentMethod: "pix",
        payment: ["overdue"],
        from: "2026-10-05",
        to: "2026-10-07",
        search: "Aluguel",
      },
      agora
    );

    const clauses = andClauses(where);
    expect(where.barbershopId).toBe(SHOP);
    expect(clauses).toHaveLength(8);
    expect(clauses[0]).toEqual({ categoryId: "cat-uuid-1" });
    expect(clauses[1]).toEqual({ type: "FIXED" });
    expect(clauses[2]).toEqual({ recurrence: "MONTHLY" });
    expect(clauses[3]).toEqual({
      paymentMethod: { equals: "pix", mode: "insensitive" },
    });
    expect(clauses[4]).toEqual({ paidAt: null });
    expect(clauses[5]).toEqual({ dueDate: { lt: agora } });
    expect(clauses[6]).toMatchObject({ referenceDate: expect.any(Object) });
    expect(clauses[7]).toMatchObject({ OR: expect.any(Array) });
  });
});

describe("modules/expenses — buildExpenseOrderBy", () => {
  it("sem sort: referenceDate desc, id desc (ordenamento atual)", () => {
    expect(buildExpenseOrderBy(undefined)).toEqual([
      { referenceDate: "desc" },
      { id: "desc" },
    ]);
  });

  it("referenceDate asc: desempate por id na mesma direção", () => {
    expect(buildExpenseOrderBy({ field: "referenceDate", dir: "asc" })).toEqual([
      { referenceDate: "asc" },
      { id: "asc" },
    ]);
  });

  it("amount: ordena pela coluna amount", () => {
    expect(buildExpenseOrderBy({ field: "amount", dir: "desc" })).toEqual([
      { amount: "desc" },
      { id: "desc" },
    ]);
  });

  it("dueDate: nulls last na ordem crescente", () => {
    expect(buildExpenseOrderBy({ field: "dueDate", dir: "asc" })).toEqual([
      { dueDate: { sort: "asc", nulls: "last" } },
      { id: "asc" },
    ]);
  });

  it("dueDate: nulls last também na ordem decrescente", () => {
    expect(buildExpenseOrderBy({ field: "dueDate", dir: "desc" })).toEqual([
      { dueDate: { sort: "desc", nulls: "last" } },
      { id: "desc" },
    ]);
  });

  it("createdAt: desempate por id na mesma direção", () => {
    expect(buildExpenseOrderBy({ field: "createdAt", dir: "asc" })).toEqual([
      { createdAt: "asc" },
      { id: "asc" },
    ]);
  });
});
