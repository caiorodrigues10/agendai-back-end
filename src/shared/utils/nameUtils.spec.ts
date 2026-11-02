/// <reference types="vitest/globals" />
import { normalizeNameWords, namesMatch } from "./nameUtils";

describe("normalizeNameWords", () => {
  it("remove acentos e coloca em minúsculas", () => {
    expect(normalizeNameWords("José da Silva")).toEqual(["jose", "silva"]);
  });

  it("remove preposições (de, da, do, dos, das, e)", () => {
    expect(normalizeNameWords("Maria da Conceição dos Santos e Silva")).toEqual([
      "maria",
      "conceicao",
      "santos",
      "silva",
    ]);
  });

  it("remove pontos de iniciais", () => {
    expect(normalizeNameWords("José A. Silva")).toEqual(["jose", "a", "silva"]);
  });

  it("colapsa espaços e trim", () => {
    expect(normalizeNameWords("  João   Pedro  ")).toEqual(["joao", "pedro"]);
  });

  it("retorna array vazio para nome nulo/vazio", () => {
    expect(normalizeNameWords(null)).toEqual([]);
    expect(normalizeNameWords("")).toEqual([]);
    expect(normalizeNameWords(undefined)).toEqual([]);
  });
});

describe("namesMatch", () => {
  it("nomes iguais são match", () => {
    expect(namesMatch("Maria Silva", "Maria Silva")).toBe(true);
  });

  it("ignora diferença de caixa e acento", () => {
    expect(namesMatch("JOSÉ SILVA", "jose silva")).toBe(true);
    expect(namesMatch("Maria da Silva", "Maria da Silva")).toBe(true);
  });

  it("nome social: preposições são ignoradas", () => {
    expect(namesMatch("Maria da Silva", "Maria Silva")).toBe(true);
    expect(namesMatch("Maria Silva", "Maria da Silva")).toBe(true);
  });

  it("sobrenome composto com preposição", () => {
    expect(namesMatch("José da Silva Santos", "José Silva Santos")).toBe(true);
    expect(namesMatch("José Silva Santos", "José da Silva Santos")).toBe(true);
  });

  it("abreviação do nome do meio (inicial corresponde ao nome completo)", () => {
    expect(namesMatch("José Antonio Silva", "José A. Silva")).toBe(true);
    expect(namesMatch("José A. Silva", "José Antonio Silva")).toBe(true);
  });

  it("nomes diferentes não são match", () => {
    expect(namesMatch("Maria Silva", "João Silva")).toBe(false);
    expect(namesMatch("Maria Silva", "Maria Santos")).toBe(false);
  });

  it("nome nulo ou vazio nunca é match", () => {
    expect(namesMatch(null, "Maria Silva")).toBe(false);
    expect(namesMatch("Maria Silva", undefined)).toBe(false);
    expect(namesMatch("", "")).toBe(false);
  });

  it("inicial sozinha não casa com nome que começa por letra diferente", () => {
    expect(namesMatch("José B. Silva", "José Antonio Silva")).toBe(false);
  });
});
