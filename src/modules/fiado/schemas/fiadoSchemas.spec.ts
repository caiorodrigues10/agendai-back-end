import { describe, expect, it } from "vitest";
import { listFiadoQuerySchema } from "./fiadoSchemas";

describe("modules/fiado — listFiadoQuerySchema (migrado ao helper)", () => {
  it("primeira página: defaults page=1, limit=20", () => {
    const parsed = listFiadoQuerySchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.limit).toBe(20);
  });

  it("aceita limit explícito até o teto 100", () => {
    expect(listFiadoQuerySchema.parse({ limit: 100 }).limit).toBe(100);
  });

  it("rejeita limit acima do teto (101) → 400", () => {
    expect(() => listFiadoQuerySchema.parse({ limit: 101 })).toThrow();
  });

  it("rejeita page abaixo de 1", () => {
    expect(() => listFiadoQuerySchema.parse({ page: 0 })).toThrow();
  });

  it("aceita status válido", () => {
    expect(listFiadoQuerySchema.parse({ status: "PENDING" }).status).toBe("PENDING");
  });

  it("rejeita status fora do enum → 400", () => {
    expect(() => listFiadoQuerySchema.parse({ status: "QUITADO" })).toThrow();
  });

  it("busca sem resultado não altera a validação da query", () => {
    const parsed = listFiadoQuerySchema.parse({ search: "inexistente", page: 1 });
    expect(parsed.search).toBe("inexistente");
    expect(parsed.page).toBe(1);
  });
});
