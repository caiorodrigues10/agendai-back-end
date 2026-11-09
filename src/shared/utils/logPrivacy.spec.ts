/// <reference types="vitest/globals" />
import { maskCpfForLogs, maskNameForLogs } from "./logPrivacy";

describe("logPrivacy — CPF e nome nunca aparecem completos em log", () => {
  describe("maskCpfForLogs", () => {
    it("mascara os dígitos centrais do CPF (3 primeiros e 2 últimos visíveis)", () => {
      const masked = maskCpfForLogs("529.982.247-25");
      expect(masked).toBe("529.***.**-25");
    });

    it("não contém o CPF completo na máscara", () => {
      const masked = maskCpfForLogs("11122233344");
      expect(masked).not.toContain("11122233344");
      expect(masked).not.toContain("222333");
      expect(masked).toBe("111.***.**-44");
    });

    it("funciona com CPF já mascarado ou sem máscara", () => {
      expect(maskCpfForLogs("52998224725")).toBe("529.***.**-25");
      expect(maskCpfForLogs("529.982.247-25")).toBe("529.***.**-25");
    });

    it("retorna vazio para CPF nulo/vazio", () => {
      expect(maskCpfForLogs(null)).toBe("");
      expect(maskCpfForLogs("")).toBe("");
      expect(maskCpfForLogs(undefined)).toBe("");
    });

    it("retorna 'inválido' para CPF com tamanho errado", () => {
      expect(maskCpfForLogs("123")).toBe("inválido");
    });
  });

  describe("maskNameForLogs", () => {
    it("mostra apenas a primeira letra do nome", () => {
      const masked = maskNameForLogs("Maria da Silva");
      expect(masked[0]).toBe("M");
      expect(masked.slice(1)).toBe("*".repeat("Maria da Silva".length - 1));
    });

    it("não contém o nome completo na máscara", () => {
      const masked = maskNameForLogs("Maria da Silva");
      expect(masked).not.toContain("Maria da Silva");
      expect(masked).not.toContain("Silva");
      expect(masked).not.toContain("Maria");
    });

    it("funciona com nome curto", () => {
      expect(maskNameForLogs("João")).toBe("J***");
    });

    it("retorna vazio para nome nulo/vazio", () => {
      expect(maskNameForLogs(null)).toBe("");
      expect(maskNameForLogs("")).toBe("");
      expect(maskNameForLogs(undefined)).toBe("");
    });
  });
});
