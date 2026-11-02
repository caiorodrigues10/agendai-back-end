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

  it("nome do meio diferente não é match (não é inicial compatível)", () => {
    expect(namesMatch("João Pedro Silva", "João Carlos Silva")).toBe(false);
    expect(namesMatch("João Carlos Silva", "João Pedro Silva")).toBe(false);
  });

  it("subsequência: nomes do meio do lado curto casam em ordem com algum do lado longo", () => {
    expect(namesMatch("Maria Silva Santos", "Maria Aparecida Silva Santos")).toBe(true);
    expect(namesMatch("João Pedro Carlos Silva", "João P. Silva")).toBe(true);
  });

  it("ordem dos nomes do meio importa (subsequência, não conjunto)", () => {
    expect(namesMatch("João Carlos Pedro Silva", "João Pedro Carlos Silva")).toBe(false);
  });

  it("sem nome do meio de um lado é tolerado", () => {
    expect(namesMatch("João Silva", "João A. Silva")).toBe(true);
    expect(namesMatch("João A. Silva", "João Silva")).toBe(true);
    expect(namesMatch("Maria Silva", "Maria S. Silva")).toBe(true);
  });

  // --- Regras de ordem e quantidade (restrições da nova versão) ---

  it("nome com uma só palavra não bate contra nome composto", () => {
    expect(namesMatch("Maria", "Maria Silva")).toBe(false);
    expect(namesMatch("Maria Silva", "Maria")).toBe(false);
  });

  it("sobrenome sozinho não bate contra nome composto", () => {
    expect(namesMatch("Silva", "Maria Silva")).toBe(false);
    expect(namesMatch("Maria Silva", "Silva")).toBe(false);
  });

  it("ordem invertida não é match", () => {
    expect(namesMatch("Silva Maria", "Maria Silva")).toBe(false);
  });

  it("primeiro nome diferente não é match", () => {
    expect(namesMatch("Maria Silva", "João Silva")).toBe(false);
  });

  it("sobrenome diferente não é match", () => {
    expect(namesMatch("Maria Silva", "Maria Santos")).toBe(false);
  });

  it("nome nulo ou vazio nunca é match", () => {
    expect(namesMatch(null, "Maria Silva")).toBe(false);
    expect(namesMatch("Maria Silva", undefined)).toBe(false);
    expect(namesMatch("", "")).toBe(false);
  });
});
