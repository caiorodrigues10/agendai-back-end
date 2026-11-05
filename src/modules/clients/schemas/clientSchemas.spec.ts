import { describe, expect, it } from "vitest";
import { listClientsQuerySchema } from "./clientSchemas";

describe("modules/clients — listClientsQuerySchema (migrado ao helper)", () => {
  it("primeira página: defaults page=1, limit=20", () => {
    const parsed = listClientsQuerySchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.limit).toBe(20);
  });

  it("aceita limit explícito até o teto 100", () => {
    expect(listClientsQuerySchema.parse({ limit: 100 }).limit).toBe(100);
  });

  it("rejeita limit acima do teto (101) → 400", () => {
    expect(() => listClientsQuerySchema.parse({ limit: 101 })).toThrow();
  });

  it("rejeita page abaixo de 1", () => {
    expect(() => listClientsQuerySchema.parse({ page: 0 })).toThrow();
  });

  it("busca sem resultado não altera a validação da query", () => {
    const parsed = listClientsQuerySchema.parse({ search: "inexistente", page: 1 });
    expect(parsed.search).toBe("inexistente");
    expect(parsed.page).toBe(1);
  });

  it("busca respeita tamanho máximo (300)", () => {
    expect(() => listClientsQuerySchema.parse({ search: "a".repeat(301) })).toThrow();
    expect(listClientsQuerySchema.parse({ search: "a".repeat(300) }).search).toHaveLength(300);
  });
});
