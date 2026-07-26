import { describe, it, expect } from "vitest";
import { isValidCpf, normalizeCpf, maskCpf } from "./cpfUtils";

describe("cpfUtils", () => {
  describe("isValidCpf", () => {
    it("aceita CPF válido sem máscara", () => {
      expect(isValidCpf("52998224725")).toBe(true);
    });

    it("aceita CPF válido com máscara", () => {
      expect(isValidCpf("529.982.247-25")).toBe(true);
    });

    it("rejeita CPF com dígitos verificadores errados", () => {
      expect(isValidCpf("52998224726")).toBe(false);
    });

    it("rejeita sequência repetida (111.111.111-11)", () => {
      expect(isValidCpf("11111111111")).toBe(false);
    });

    it("rejeita sequência repetida (000.000.000-00)", () => {
      expect(isValidCpf("00000000000")).toBe(false);
    });

    it("rejeita CPF com menos de 11 dígitos", () => {
      expect(isValidCpf("1234567890")).toBe(false);
    });

    it("rejeita CPF com mais de 11 dígitos", () => {
      expect(isValidCpf("123456789012")).toBe(false);
    });

    it("rejeita string vazia", () => {
      expect(isValidCpf("")).toBe(false);
    });

    it("aceita 168.995.350-09", () => {
      // Nota: o fixture anterior (045.001.300-88) tinha dígito verificador inválido
      expect(isValidCpf("16899535009")).toBe(true);
    });
  });

  describe("normalizeCpf", () => {
    it("remove pontos e traço", () => {
      expect(normalizeCpf("529.982.247-25")).toBe("52998224725");
    });

    it("mantém sem máscara", () => {
      expect(normalizeCpf("52998224725")).toBe("52998224725");
    });
  });

  describe("maskCpf", () => {
    it("formata corretamente", () => {
      expect(maskCpf("52998224725")).toBe("529.982.247-25");
    });

    it("funciona com CPF já com máscara", () => {
      expect(maskCpf("529.982.247-25")).toBe("529.982.247-25");
    });
  });
});