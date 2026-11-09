import { describe, expect, it } from "vitest";
import { listTeamQuerySchema, TEAM_SORT_FIELDS } from "./userSchemas";

describe("listTeamQuerySchema", () => {
  it("defaults: primeira página, 100 por página (equipe inteira), sem filtros", () => {
    expect(listTeamQuerySchema.parse({})).toEqual({
      page: 1,
      limit: 100,
    });
  });

  it("page e limit aceitam string (query string) e são limitedos", () => {
    expect(listTeamQuerySchema.parse({ page: "3", limit: "50" })).toMatchObject({
      page: 3,
      limit: 50,
    });
    expect(() => listTeamQuerySchema.parse({ page: "0" })).toThrow();
    expect(() => listTeamQuerySchema.parse({ limit: "101" })).toThrow();
  });

  it("search: recorta, e termo vazio vira undefined (sem filtro)", () => {
    expect(listTeamQuerySchema.parse({ search: "  Ana  " }).search).toBe("Ana");
    expect(listTeamQuerySchema.parse({ search: "   " }).search).toBeUndefined();
    expect(() => listTeamQuerySchema.parse({ search: "x".repeat(101) })).toThrow();
  });

  it("active: só aceita true/false", () => {
    expect(listTeamQuerySchema.parse({ active: "true" }).active).toBe(true);
    expect(listTeamQuerySchema.parse({ active: "false" }).active).toBe(false);
    expect(() => listTeamQuerySchema.parse({ active: "1" })).toThrow();
  });

  it("role: só os papéis que formam a equipe do salão", () => {
    expect(listTeamQuerySchema.parse({ role: "OWNER" }).role).toBe("OWNER");
    expect(listTeamQuerySchema.parse({ role: "EMPLOYEE" }).role).toBe("EMPLOYEE");
  });

  it("role: MASTER_ADMIN e CUSTOMER são recusados (400)", () => {
    expect(() => listTeamQuerySchema.parse({ role: "MASTER_ADMIN" })).toThrow();
    expect(() => listTeamQuerySchema.parse({ role: "CUSTOMER" })).toThrow();
  });

  it("sort: só a whitelist, com direção asc/desc", () => {
    expect(listTeamQuerySchema.parse({ sort: "nome:asc" }).sort).toEqual({
      field: "nome",
      dir: "asc",
    });
    expect(listTeamQuerySchema.parse({ sort: "criado:desc" }).sort).toEqual({
      field: "criado",
      dir: "desc",
    });
    expect(listTeamQuerySchema.parse({ sort: "nome" }).sort).toEqual({
      field: "nome",
      dir: "asc",
    });
  });

  it("sort: campo fora da whitelist ou direção inválida devolve erro", () => {
    expect(() => listTeamQuerySchema.parse({ sort: "password:asc" })).toThrow();
    expect(() => listTeamQuerySchema.parse({ sort: "nome:sideways" })).toThrow();
    expect(TEAM_SORT_FIELDS).toEqual(["nome", "email", "cargo", "criado"]);
  });

  it("barbershopId da query é ignorado pelo schema (o salão vem do contexto)", () => {
    const parsed = listTeamQuerySchema.parse({ barbershopId: "outro-salão" });
    expect(parsed).not.toHaveProperty("barbershopId");
  });
});
