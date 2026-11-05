import { describe, expect, it } from "vitest";
import { listServicesQuerySchema } from "./serviceSchemas";

describe("listServicesQuerySchema", () => {
  it("sem query: página 1 e limite 100 (o catálogo inteiro continua vindo)", () => {
    const parsed = listServicesQuerySchema.parse({});

    expect(parsed.page).toBe(1);
    expect(parsed.limit).toBe(100);
    expect(parsed.search).toBeUndefined();
    expect(parsed.categoryId).toBeUndefined();
    expect(parsed.active).toBeUndefined();
    expect(parsed.sort).toBeUndefined();
  });

  it("aceita page/limit dentro do teto", () => {
    const parsed = listServicesQuerySchema.parse({ page: "2", limit: "25" });

    expect(parsed.page).toBe(2);
    expect(parsed.limit).toBe(25);
  });

  it("rejeita page/limit fora do teto", () => {
    expect(() => listServicesQuerySchema.parse({ page: "0" })).toThrow();
    expect(() => listServicesQuerySchema.parse({ limit: "101" })).toThrow();
  });

  it("search: recorta espaços e busca vazia vira sem filtro", () => {
    expect(listServicesQuerySchema.parse({ search: "  Corte  " }).search).toBe("Corte");
    expect(listServicesQuerySchema.parse({ search: "   " }).search).toBeUndefined();
  });

  it("search acima do limite é rejeitado", () => {
    expect(() =>
      listServicesQuerySchema.parse({ search: "a".repeat(101) }),
    ).toThrow();
  });

  it("categoryId precisa ser uuid", () => {
    expect(
      listServicesQuerySchema.parse({
        categoryId: "11111111-1111-4111-8111-111111111111",
      }).categoryId,
    ).toBe("11111111-1111-4111-8111-111111111111");

    expect(() => listServicesQuerySchema.parse({ categoryId: "abc" })).toThrow();
  });

  it("active aceita apenas true/false", () => {
    expect(listServicesQuerySchema.parse({ active: "true" }).active).toBe(true);
    expect(listServicesQuerySchema.parse({ active: "false" }).active).toBe(false);
    expect(() => listServicesQuerySchema.parse({ active: "1" })).toThrow();
  });

  it("sort aceita apenas os campos da whitelist", () => {
    expect(listServicesQuerySchema.parse({ sort: "nome:asc" }).sort).toEqual({
      field: "nome",
      dir: "asc",
    });
    expect(listServicesQuerySchema.parse({ sort: "preco:desc" }).sort).toEqual({
      field: "preco",
      dir: "desc",
    });
    expect(listServicesQuerySchema.parse({ sort: "duracao" }).sort).toEqual({
      field: "duracao",
      dir: "asc",
    });
    expect(listServicesQuerySchema.parse({ sort: "criado:desc" }).sort).toEqual({
      field: "criado",
      dir: "desc",
    });
  });

  it("sort inválido (campo ou direção) é rejeitado", () => {
    expect(() => listServicesQuerySchema.parse({ sort: "password:asc" })).toThrow();
    expect(() => listServicesQuerySchema.parse({ sort: "nome:lateral" })).toThrow();
  });

  it("barbershopId da query não vira filtro: é lido na query crua", () => {
    const parsed = listServicesQuerySchema.parse({
      barbershopId: "barbershop-2",
    });

    expect(parsed).not.toHaveProperty("barbershopId");
  });
});
