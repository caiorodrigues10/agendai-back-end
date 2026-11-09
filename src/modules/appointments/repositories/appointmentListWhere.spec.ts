import { describe, expect, it } from "vitest";
import type { Prisma } from "@prisma/client";
import {
  buildAppointmentListWhere,
  buildAppointmentOrderBy,
} from "./appointmentListWhere";

const SHOP = "00000000-0000-4000-8000-000000000001";
const OTHER_SHOP = "00000000-0000-4000-8000-000000000002";
const SERVICE = "11111111-1111-4111-8111-111111111111";
const STAFF = "22222222-2222-4222-8222-222222222222";

function clauses(where: Prisma.AppointmentWhereInput) {
  return (where.AND ?? []) as Prisma.AppointmentWhereInput[];
}

describe("modules/appointments — buildAppointmentListWhere", () => {
  it("sem filtros: where só carrega o barbershopId do contexto", () => {
    const where = buildAppointmentListWhere(SHOP, { page: 1, limit: 20 });

    expect(where).toEqual({ barbershopId: SHOP });
  });

  it("barbershopId vem sempre do contexto, nunca de um filtro da query", () => {
    const where = buildAppointmentListWhere(
      SHOP,
      {
        page: 1,
        limit: 20,
        status: ["CONFIRMED"],
        serviceId: SERVICE,
        staffId: STAFF,
        search: "ana",
      },
    );

    expect(where.barbershopId).toBe(SHOP);
    expect(where.barbershopId).not.toBe(OTHER_SHOP);
  });

  // ─── filtro isolado ───────────────────────────────────────

  it("serviceId isolado vira uma cláusula própria", () => {
    const where = buildAppointmentListWhere(SHOP, { page: 1, limit: 20, serviceId: SERVICE });

    expect(where).toEqual({ barbershopId: SHOP, AND: [{ serviceId: SERVICE }] });
  });

  it("staffId isolado vira uma cláusula própria", () => {
    const where = buildAppointmentListWhere(SHOP, { page: 1, limit: 20, staffId: STAFF });

    expect(where).toEqual({ barbershopId: SHOP, AND: [{ staffId: STAFF }] });
  });

  it("busca isolada monta OR por nome e WhatsApp", () => {
    const where = buildAppointmentListWhere(SHOP, { page: 1, limit: 20, search: "ana" });

    expect(where).toEqual({
      barbershopId: SHOP,
      AND: [
        {
          OR: [
            { customerName: { contains: "ana", mode: "insensitive" } },
            { whatsapp: { contains: "ana" } },
          ],
        },
      ],
    });
  });

  // ─── status em lista ──────────────────────────────────────

  it("status em lista vira `in` com todos os valores", () => {
    const where = buildAppointmentListWhere(SHOP, {
      page: 1,
      limit: 20,
      status: ["CONFIRMED", "COMPLETED", "NO_SHOW"],
    });

    expect(where).toEqual({
      barbershopId: SHOP,
      AND: [{ status: { in: ["CONFIRMED", "COMPLETED", "NO_SHOW"] } }],
    });
  });

  it("status com um único valor (compatibilidade) vira `in` com um item", () => {
    const where = buildAppointmentListWhere(SHOP, { page: 1, limit: 20, status: ["CONFIRMED"] });

    expect(where).toEqual({ barbershopId: SHOP, AND: [{ status: { in: ["CONFIRMED"] } }] });
  });

  it("lista de status vazia não gera cláusula", () => {
    const where = buildAppointmentListWhere(SHOP, { page: 1, limit: 20, status: [] });

    expect(where).toEqual({ barbershopId: SHOP });
  });

  // ─── date vs from/to ──────────────────────────────────────

  it("date isolada usa os limites UTC do dia", () => {
    const where = buildAppointmentListWhere(SHOP, { page: 1, limit: 20, date: "2026-10-05" });

    expect(clauses(where)).toEqual([
      { date: { gte: new Date("2026-10-05T00:00:00.000Z"), lt: new Date("2026-10-06T00:00:00.000Z") } },
    ]);
  });

  it("from/to isolados viram intervalo civil (from inclusivo, to exclusivo)", () => {
    const where = buildAppointmentListWhere(SHOP, {
      page: 1,
      limit: 20,
      from: "2026-10-01",
      to: "2026-10-31",
    });

    expect(clauses(where)).toEqual([
      {
        date: {
          gte: new Date("2026-10-01T00:00:00.000Z"),
          lt: new Date("2026-11-01T00:00:00.000Z"),
        },
      },
    ]);
  });

  it("date tem precedência sobre from/to: o intervalo civil é ignorado", () => {
    const where = buildAppointmentListWhere(SHOP, {
      page: 1,
      limit: 20,
      date: "2026-10-05",
      from: "2026-10-01",
      to: "2026-10-31",
    });

    const and = clauses(where);
    expect(and).toHaveLength(1);
    expect(and[0]).toEqual({
      date: { gte: new Date("2026-10-05T00:00:00.000Z"), lt: new Date("2026-10-06T00:00:00.000Z") },
    });
  });

  // ─── dois filtros combinados ──────────────────────────────

  it("dois filtros combinados viram duas cláusulas independentes dentro de AND", () => {
    const where = buildAppointmentListWhere(SHOP, {
      page: 1,
      limit: 20,
      status: ["CONFIRMED", "COMPLETED"],
      serviceId: SERVICE,
    });

    expect(where).toEqual({
      barbershopId: SHOP,
      AND: [{ status: { in: ["CONFIRMED", "COMPLETED"] } }, { serviceId: SERVICE }],
    });
  });

  it("busca e status combinados não sobrescrevem o OR um do outro", () => {
    const where = buildAppointmentListWhere(SHOP, {
      page: 1,
      limit: 20,
      search: "ana",
      status: ["CONFIRMED"],
    });

    const and = clauses(where);
    expect(and).toHaveLength(2);
    expect(and[0]).toEqual({ status: { in: ["CONFIRMED"] } });
    expect(and[1]).toEqual({
      OR: [
        { customerName: { contains: "ana", mode: "insensitive" } },
        { whatsapp: { contains: "ana" } },
      ],
    });
  });

  it("todos os filtros juntos: cinco cláusulas em AND", () => {
    const where = buildAppointmentListWhere(SHOP, {
      page: 1,
      limit: 20,
      date: "2026-10-05",
      status: ["CONFIRMED"],
      staffId: STAFF,
      serviceId: SERVICE,
      search: "ana",
    });

    expect(clauses(where)).toHaveLength(5);
  });
});

describe("modules/appointments — buildAppointmentOrderBy", () => {
  it("sem sort: data, horário e id em ordem crescente (comportamento atual)", () => {
    expect(buildAppointmentOrderBy(undefined)).toEqual([
      { date: "asc" },
      { time: "asc" },
      { id: "asc" },
    ]);
  });

  it("sort por data desc: o horário acompanha na mesma direção", () => {
    expect(buildAppointmentOrderBy({ field: "date", dir: "desc" })).toEqual([
      { date: "desc" },
      { time: "desc" },
      { id: "asc" },
    ]);
  });

  it("sort por data asc: o horário acompanha na mesma direção", () => {
    expect(buildAppointmentOrderBy({ field: "date", dir: "asc" })).toEqual([
      { date: "asc" },
      { time: "asc" },
      { id: "asc" },
    ]);
  });
});
