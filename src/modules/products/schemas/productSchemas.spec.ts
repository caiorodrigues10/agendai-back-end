import { describe, expect, it } from "vitest";
import { listProductsQuerySchema, paginationQuerySchema } from "./productSchemas";

describe("modules/products — listProductsQuerySchema (migrado ao helper)", () => {
  it("primeira página: defaults page=1, limit=30", () => {
    const parsed = listProductsQuerySchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.limit).toBe(30);
  });

  it("aceita limit explícito até o teto 100", () => {
    expect(listProductsQuerySchema.parse({ limit: 100 }).limit).toBe(100);
  });

  it("rejeita limit acima do teto (101) → 400", () => {
    expect(() => listProductsQuerySchema.parse({ limit: 101 })).toThrow();
  });

  it("rejeita page abaixo de 1", () => {
    expect(() => listProductsQuerySchema.parse({ page: 0 })).toThrow();
  });

  it("busca respeita tamanho máximo (80)", () => {
    expect(() =>
      listProductsQuerySchema.parse({ search: "a".repeat(81) }),
    ).toThrow();
    expect(listProductsQuerySchema.parse({ search: "a".repeat(80) }).search).toHaveLength(
      80,
    );
  });

  it("sem resultado não altera a validação da query", () => {
    const parsed = listProductsQuerySchema.parse({ search: "inexistente", page: 1 });
    expect(parsed.search).toBe("inexistente");
    expect(parsed.page).toBe(1);
  });
});

describe("modules/products — paginationQuerySchema (movimentos/receitas/vendas)", () => {
  it("mantém default 50 e teto 100 (comportamento inalterado)", () => {
    expect(paginationQuerySchema.parse({}).limit).toBe(50);
    expect(paginationQuerySchema.parse({ limit: 100 }).limit).toBe(100);
    expect(() => paginationQuerySchema.parse({ limit: 101 })).toThrow();
  });
});
