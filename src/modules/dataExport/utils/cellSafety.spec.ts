/**
 * Unit — segurança e formatação de células da exportação.
 *
 * A neutralização de fórmula é a defesa mais importante: um nome de cliente
 * que começa com "=" viraria fórmula no Excel do contador.
 */
import { describe, it, expect } from "vitest";
import {
  safeBool,
  safeNumber,
  safeText,
  anonymizeEmail,
  anonymizeName,
  anonymizePhone,
} from "./cellSafety";

describe("safeText — neutralização de fórmula", () => {
  it("prefixa valores que o Excel leria como fórmula", () => {
    expect(safeText("=1+1")).toBe("'=1+1");
    expect(safeText("+42")).toBe("'+42");
    expect(safeText("@usuario")).toBe("'@usuario");
    expect(safeText("\tcomando")).toBe("'\tcomando");
    expect(safeText("\rcomando")).toBe("'\rcomando");
  });

  it("não mexe em texto normal", () => {
    expect(safeText("Maria da Silva")).toBe("Maria da Silva");
    expect(safeText("Agendamento às 10:00")).toBe("Agendamento às 10:00");
  });

  it("mantém números negativos legítimos como texto intacto", () => {
    expect(safeText("-50")).toBe("-50");
    expect(safeText("-1.234,56")).toBe("-1.234,56");
  });

  it("prefixa texto negativo que não é número", () => {
    expect(safeText("-cmd|calc")).toBe("'-cmd|calc");
  });

  it("trata vazio e nulo", () => {
    expect(safeText("")).toBeNull();
    expect(safeText(null)).toBeNull();
    expect(safeText(undefined)).toBeNull();
  });
});

describe("safeNumber", () => {
  it("aceita formatos pt-BR e en-US", () => {
    expect(safeNumber("1.234,56")).toBe(1234.56);
    expect(safeNumber("1234.56")).toBe(1234.56);
    expect(safeNumber("1234,56")).toBe(1234.56);
    expect(safeNumber("R$ 80,00")).toBe(80);
    expect(safeNumber(42)).toBe(42);
  });

  it("devolve nulo para o que não é número", () => {
    expect(safeNumber("abc")).toBeNull();
    expect(safeNumber("")).toBeNull();
    expect(safeNumber(null)).toBeNull();
  });
});

describe("safeBool", () => {
  it("escreve Sim/Não", () => {
    expect(safeBool(true)).toBe("Sim");
    expect(safeBool(false)).toBe("Não");
    expect(safeBool(null)).toBeNull();
  });
});

describe("anonimização", () => {
  it("mascara o nome mantendo as iniciais", () => {
    expect(anonymizeName("Maria da Silva")).toBe("M*** d* S***");
    expect(anonymizeName("Ana")).toBe("A**");
    expect(anonymizeName("A")).toBe("A*");
  });

  it("mascara o telefone", () => {
    expect(anonymizePhone("11987654321")).toBe("119****4321");
  });

  it("mascara o e-mail", () => {
    expect(anonymizeEmail("maria@example.com")).toBe("m***@example.com");
  });

  it("não quebra com valores vazios", () => {
    expect(anonymizeName(null)).toBeNull();
    expect(anonymizePhone(undefined)).toBeNull();
    expect(anonymizeEmail("")).toBeNull();
  });
});
