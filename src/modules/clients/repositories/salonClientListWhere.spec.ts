import { civilDayBounds } from "@/shared/utils/dateUtils";
import { describe, expect, it } from "vitest";
import type { Prisma } from "@prisma/client";
import {
  buildSalonClientListWhere,
  buildSalonClientOrderBy,
  inactiveThreshold,
} from "./salonClientListWhere";

const SHOP = "00000000-0000-4000-8000-000000000001";
const OTHER_SHOP = "00000000-0000-4000-8000-000000000002";
const NOW = new Date("2026-11-04T12:00:00.000Z");

describe("modules/clients — buildSalonClientListWhere", () => {
  it("sem filtros: where só carrega o barbershopId do contexto", () => {
    const where = buildSalonClientListWhere({ page: 1, limit: 20 }, SHOP, NOW);

    expect(where).toEqual({ barbershopId: SHOP });
  });

  it("barbershopId vem sempre do contexto, nunca de um filtro da query", () => {
    const where = buildSalonClientListWhere(
      {
        page: 1,
        limit: 20,
        search: "joão",
        createdFrom: "2026-01-01",
        inactiveDays: 30,
        hasOpenFiado: true,
        hasActivePackage: true,
      },
      SHOP,
      NOW,
    );

    expect(where.barbershopId).toBe(SHOP);
    expect(where.barbershopId).not.toBe(OTHER_SHOP);
  });

  // ─── busca (nome + dígitos do WhatsApp) ────────────────────

  it("busca: filtro isolado monta OR por nome e dígitos do WhatsApp", () => {
    const where = buildSalonClientListWhere(
      { page: 1, limit: 20, search: "joão 119" },
      SHOP,
      NOW,
    );

    expect(where).toEqual({
      barbershopId: SHOP,
      AND: [
        {
          OR: [
            { name: { contains: "joão 119", mode: "insensitive" } },
            { whatsapp: { contains: "119" } },
          ],
        },
      ],
    });
  });

  it("busca sem dígitos não cria a cláusula de WhatsApp", () => {
    const where = buildSalonClientListWhere(
      { page: 1, limit: 20, search: "joão" },
      SHOP,
      NOW,
    );

    expect(where.AND).toEqual([
      { OR: [{ name: { contains: "joão", mode: "insensitive" } }] },
    ]);
  });

  // ─── createdFrom / createdTo ───────────────────────────────

  it("createdFrom isolado: início do dia civil no fuso do salão", () => {
    const where = buildSalonClientListWhere(
      { page: 1, limit: 20, createdFrom: "2026-01-01" },
      SHOP,
      NOW,
    );

    expect(where.AND).toEqual([
      { createdAt: { gte: civilDayBounds("2026-01-01").gte } },
    ]);
  });

  it("createdTo isolado: limite exclusivo no início do dia seguinte (fuso do salão)", () => {
    const where = buildSalonClientListWhere(
      { page: 1, limit: 20, createdTo: "2026-01-31" },
      SHOP,
      NOW,
    );

    expect(where.AND).toEqual([
      { createdAt: { lt: civilDayBounds("2026-01-31").lt } },
    ]);
  });

  it("evento às 22h locais do último dia ENTRA; 01h UTC do dia seguinte não", () => {
    const where = buildSalonClientListWhere(
      { page: 1, limit: 20, createdFrom: "2026-10-05", createdTo: "2026-10-05" },
      SHOP,
      NOW,
    );
    const clause = (
      (where.AND ?? []) as Array<{ createdAt: { gte: Date; lt: Date } }>
    )[0].createdAt;

    // 2026-10-06T01:00Z = 2026-10-05 22:00 em São Paulo → dentro do dia 05
    const evento = new Date("2026-10-06T01:00:00.000Z");
    expect(evento.getTime()).toBeGreaterThanOrEqual(clause.gte.getTime());
    expect(evento.getTime()).toBeLessThan(clause.lt.getTime());
  });

  // ─── inactiveDays ─────────────────────────────────────────

  it("inactiveDays: OR entre lastVisitAt antigo e nunca-visitou com createdAt antigo", () => {
    const threshold = inactiveThreshold(30, NOW);
    const where = buildSalonClientListWhere(
      { page: 1, limit: 20, inactiveDays: 30 },
      SHOP,
      NOW,
    );

    expect(where.AND).toEqual([
      {
        OR: [
          { lastVisitAt: { lt: threshold } },
          { AND: [{ lastVisitAt: null }, { createdAt: { lt: threshold } }] },
        ],
      },
    ]);
    expect(threshold.toISOString()).toBe("2026-10-05T12:00:00.000Z");
  });

  // ─── hasOpenFiado ─────────────────────────────────────────

  it("hasOpenFiado=true: relação some com status PENDING/PARTIAL e barbershopId do contexto", () => {
    const where = buildSalonClientListWhere(
      { page: 1, limit: 20, hasOpenFiado: true },
      SHOP,
      NOW,
    );

    expect(where.AND).toEqual([
      {
        fiados: {
          some: { barbershopId: SHOP, status: { in: ["PENDING", "PARTIAL"] } },
        },
      },
    ]);
  });

  it("hasOpenFiado=false: relação none com os mesmos critérios", () => {
    const where = buildSalonClientListWhere(
      { page: 1, limit: 20, hasOpenFiado: false },
      SHOP,
      NOW,
    );

    expect(where.AND).toEqual([
      {
        fiados: {
          none: { barbershopId: SHOP, status: { in: ["PENDING", "PARTIAL"] } },
        },
      },
    ]);
  });

  // ─── hasActivePackage ─────────────────────────────────────

  it("hasActivePackage=true: relação some com status ACTIVE", () => {
    const where = buildSalonClientListWhere(
      { page: 1, limit: 20, hasActivePackage: true },
      SHOP,
      NOW,
    );

    expect(where.AND).toEqual([
      {
        packages: {
          some: {
            barbershopId: SHOP,
            status: "ACTIVE",
            remainingSessions: { gt: 0 },
            OR: [{ expiresAt: null }, { expiresAt: { gt: NOW } }],
          },
        },
      },
    ]);
  });

  it("hasActivePackage=false: relação none com status ACTIVE", () => {
    const where = buildSalonClientListWhere(
      { page: 1, limit: 20, hasActivePackage: false },
      SHOP,
      NOW,
    );

    expect(where.AND).toEqual([
      {
        packages: {
          none: {
            barbershopId: SHOP,
            status: "ACTIVE",
            remainingSessions: { gt: 0 },
            OR: [{ expiresAt: null }, { expiresAt: { gt: NOW } }],
          },
        },
      },
    ]);
  });

  // ─── combinação ───────────────────────────────────────────

  it("dois filtros combinados: viram duas cláusulas independentes dentro de AND", () => {
    const where = buildSalonClientListWhere(
      { page: 1, limit: 20, createdFrom: "2026-01-01", hasActivePackage: true },
      SHOP,
      NOW,
    );

    expect(where).toEqual({
      barbershopId: SHOP,
      AND: [
        { createdAt: { gte: civilDayBounds("2026-01-01").gte } },
        {
          packages: {
            some: {
              barbershopId: SHOP,
              status: "ACTIVE",
              remainingSessions: { gt: 0 },
              OR: [{ expiresAt: null }, { expiresAt: { gt: NOW } }],
            },
          },
        },
      ],
    });
  });

  it("busca e inactiveDays combinados não sobrescrevem o OR um do outro", () => {
    const threshold = inactiveThreshold(30, NOW);
    const where = buildSalonClientListWhere(
      { page: 1, limit: 20, search: "maria", inactiveDays: 30 },
      SHOP,
      NOW,
    );

    expect(where.AND).toHaveLength(2);
    const clauses = where.AND as Prisma.SalonClientWhereInput[];
    expect(clauses[0]).toEqual({
      OR: [{ name: { contains: "maria", mode: "insensitive" } }],
    });
    expect(clauses[1]).toEqual({
      OR: [
        { lastVisitAt: { lt: threshold } },
        { AND: [{ lastVisitAt: null }, { createdAt: { lt: threshold } }] },
      ],
    });
  });

  it("todos os filtros juntos: cinco cláusulas em AND", () => {
    const where = buildSalonClientListWhere(
      {
        page: 1,
        limit: 20,
        search: "ana",
        createdFrom: "2026-01-01",
        createdTo: "2026-06-30",
        inactiveDays: 90,
        hasOpenFiado: true,
        hasActivePackage: false,
      },
      SHOP,
      NOW,
    );

    expect(where.AND).toHaveLength(5);
  });
});

describe("modules/clients — buildSalonClientOrderBy", () => {
  it("sem sort: ordena por nome e desempata por id", () => {
    expect(buildSalonClientOrderBy(undefined)).toEqual([{ name: "asc" }, { id: "asc" }]);
  });

  it("usa o campo da whitelist com a direção pedida e mantém o desempate por id", () => {
    expect(buildSalonClientOrderBy({ field: "lastVisitAt", dir: "desc" })).toEqual([
      { lastVisitAt: { sort: "desc", nulls: "last" } },
      { id: "asc" },
    ]);
    expect(buildSalonClientOrderBy({ field: "createdAt", dir: "asc" })).toEqual([
      { createdAt: "asc" },
      { id: "asc" },
    ]);
  });

  it("lastVisitAt põe os nulos por último nas duas direções", () => {
    expect(buildSalonClientOrderBy({ field: "lastVisitAt", dir: "asc" })).toEqual([
      { lastVisitAt: { sort: "asc", nulls: "last" } },
      { id: "asc" },
    ]);
    expect(buildSalonClientOrderBy({ field: "lastVisitAt", dir: "desc" })).toEqual([
      { lastVisitAt: { sort: "desc", nulls: "last" } },
      { id: "asc" },
    ]);
  });

  it("name e createdAt não recebem tratamento de nulos (colunas NOT NULL)", () => {
    expect(buildSalonClientOrderBy({ field: "name", dir: "desc" })).toEqual([
      { name: "desc" },
      { id: "asc" },
    ]);
    expect(buildSalonClientOrderBy({ field: "createdAt", dir: "desc" })).toEqual([
      { createdAt: "desc" },
      { id: "asc" },
    ]);
  });
});
