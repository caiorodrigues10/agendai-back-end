import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  buildPaginationMeta,
  booleanQuerySchema,
  dateOnlySchema,
  dateRangeSchema,
  paginationQuerySchema,
  searchTermSchema,
  sortSchema,
  toSkipTake,
} from "./pagination";

describe("paginationQuerySchema (fábrica)", () => {
  it("usa default 20 / max 100 quando não informado", () => {
    const schema = paginationQuerySchema();
    expect(schema.parse({}).limit).toBe(20);
    expect(schema.parse({}).page).toBe(1);
    expect(() => schema.parse({ limit: 101 })).toThrow();
    expect(() => schema.parse({ page: 0 })).toThrow();
    expect(() => schema.parse({ page: 10001 })).toThrow();
  });

  it("respeita defaultLimit e maxLimit por módulo", () => {
    const schema = paginationQuerySchema({ defaultLimit: 30, maxLimit: 50 });
    expect(schema.parse({}).limit).toBe(30);
    expect(schema.parse({ limit: 50 }).limit).toBe(50);
    expect(() => schema.parse({ limit: 51 })).toThrow();
  });

  it("coerce strings para número", () => {
    const schema = paginationQuerySchema();
    expect(schema.parse({ page: "3", limit: "15" })).toEqual({
      page: 3,
      limit: 15,
    });
  });
});

describe("buildPaginationMeta", () => {
  it("calcula totalPages", () => {
    expect(buildPaginationMeta(100, 1, 20)).toEqual({
      total: 100,
      page: 1,
      limit: 20,
      totalPages: 5,
    });
  });

  it("totalPages mínimo 1 mesmo com zero registros", () => {
    expect(buildPaginationMeta(0, 1, 20).totalPages).toBe(1);
    expect(buildPaginationMeta(0, 1, 20)).toEqual({
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 1,
    });
  });

  it("normaliza page e limit inválidos para 1", () => {
    expect(buildPaginationMeta(10, 0, 0)).toEqual({
      total: 10,
      page: 1,
      limit: 1,
      totalPages: 10,
    });
  });
});

describe("toSkipTake", () => {
  it("calcula skip e take", () => {
    expect(toSkipTake(1, 20)).toEqual({ skip: 0, take: 20 });
    expect(toSkipTake(3, 10)).toEqual({ skip: 20, take: 10 });
  });
});

describe("searchTermSchema", () => {
  it("aceita termo válido após trim", () => {
    expect(searchTermSchema().parse("  joão  ")).toBe("joão");
  });

  it("vazio ou só espaços não é erro: vira undefined (sem filtro)", () => {
    expect(searchTermSchema().parse("")).toBeUndefined();
    expect(searchTermSchema().parse("   ")).toBeUndefined();
  });

  it("rejeita acima do máximo default (100)", () => {
    expect(() => searchTermSchema().parse("a".repeat(101))).toThrow();
  });

  it("aceita limite máximo configurável por módulo", () => {
    expect(searchTermSchema({ max: 300 }).parse("a".repeat(300))).toHaveLength(300);
    expect(() => searchTermSchema({ max: 300 }).parse("a".repeat(301))).toThrow();
  });

  it("o máximo configurável não muda o tratamento de vazio", () => {
    expect(searchTermSchema({ max: 300 }).parse("   ")).toBeUndefined();
  });
});

describe("dateOnlySchema", () => {
  it("aceita data civil existente", () => {
    expect(dateOnlySchema.parse("2026-01-31")).toBe("2026-01-31");
    expect(dateOnlySchema.parse("2024-02-29")).toBe("2024-02-29");
  });

  it("rejeita data que não existe no calendário", () => {
    expect(() => dateOnlySchema.parse("2026-02-30")).toThrow();
    expect(() => dateOnlySchema.parse("2025-02-29")).toThrow();
    expect(() => dateOnlySchema.parse("2026-13-01")).toThrow();
    expect(() => dateOnlySchema.parse("2026-00-10")).toThrow();
  });

  it("rejeita formato fora de YYYY-MM-DD", () => {
    expect(() => dateOnlySchema.parse("31/01/2026")).toThrow();
    expect(() => dateOnlySchema.parse("2026-1-1")).toThrow();
  });
});

describe("booleanQuerySchema", () => {
  it('converte "true"/"false" para booleano', () => {
    expect(booleanQuerySchema.parse("true")).toBe(true);
    expect(booleanQuerySchema.parse("false")).toBe(false);
  });

  it("rejeita valores fora de true/false", () => {
    expect(() => booleanQuerySchema.parse("1")).toThrow();
    expect(() => booleanQuerySchema.parse("sim")).toThrow();
  });
});

describe("dateRangeSchema", () => {
  it("aceita intervalo válido", () => {
    expect(dateRangeSchema.parse({ from: "2026-01-01", to: "2026-01-31" })).toEqual({
      from: "2026-01-01",
      to: "2026-01-31",
    });
  });

  it("rejeita formato inválido e from > to", () => {
    expect(() => dateRangeSchema.parse({ from: "01-01-2026", to: "2026-01-31" })).toThrow();
    expect(() =>
      dateRangeSchema.parse({ from: "2026-02-01", to: "2026-01-31" }),
    ).toThrow();
  });
});

describe("sortSchema", () => {
  const schema = sortSchema(["name", "createdAt", "status"]);

  it("aceita campo e direção válidos", () => {
    expect(schema.parse("name:asc")).toEqual({ field: "name", dir: "asc" });
    expect(schema.parse("createdAt:desc")).toEqual({
      field: "createdAt",
      dir: "desc",
    });
    expect(schema.parse("status")).toEqual({ field: "status", dir: "asc" });
  });

  it("é undefined quando vazio", () => {
    expect(schema.parse(undefined)).toBeUndefined();
  });

  it("rejeita campo fora da whitelist", () => {
    expect(() => schema.parse("password:asc")).toThrow();
  });

  it("rejeita direção inválida", () => {
    expect(() => schema.parse("name:invalid")).toThrow();
  });

  it("não aceita interpolação crua (não retorna string solta)", () => {
    const out = schema.parse("name:desc");
    expect(typeof out).toBe("object");
    expect(out?.field).toBe("name");
  });
});
