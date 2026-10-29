import { describe, expect, it } from "vitest";
import {
  extractCaseNumber,
  parseIntimationText,
  suggestEventType,
} from "./intimationParser";

describe("parser de intimações (PJe/tribunal)", () => {
  describe("extractCaseNumber", () => {
    it("encontra o número CNJ canônico com tribunal em dígitos", () => {
      expect(extractCaseNumber("Processo 1234567-89.2026.8.26.0100")).toBe(
        "1234567-89.2026.8.26.0100"
      );
    });

    it("encontra o número CNJ com tribunal em letras", () => {
      expect(extractCaseNumber("Processo 1234567-89.2026.8.SP.0100")).toBe(
        "1234567-89.2026.8.SP.0100"
      );
    });

    it("encontra o número sem pontuação", () => {
      expect(extractCaseNumber("processo 12345678920268260100")).toBe(
        "1234567-89.2026.8.26.0100"
      );
    });

    it("devolve null quando não há número de processo", () => {
      expect(extractCaseNumber("Intimação genérica sem processo")).toBeNull();
    });
  });

  describe("suggestEventType", () => {
    it("classifica audiência como compromisso", () => {
      expect(suggestEventType("Audiência designada para o dia 12/11")).toBe(
        "MEETING"
      );
    });

    it("classifica sentença como andamento do tribunal", () => {
      expect(suggestEventType("Sentença publicada")).toBe("COURT_MOTION");
    });

    it("classifica petição como protocolo", () => {
      expect(suggestEventType("Petição inicial protocolada")).toBe("FILING");
    });

    it("classifica prazo recursal como prazo", () => {
      expect(suggestEventType("Prazo para recurso")).toBe("DEADLINE");
    });

    it("usa intimação como tipo padrão", () => {
      expect(suggestEventType("Comunicação do cartório")).toBe("INTIMATION");
    });
  });

  describe("parseIntimationText", () => {
    it("quebra um texto com várias linhas que casam o padrão CNJ", () => {
      const parsed = parseIntimationText(
        [
          "1234567-89.2026.8.26.0100 — audiência designada",
          "7654321-10.2026.8.26.0200 — sentença publicada",
        ].join("\n")
      );

      expect(parsed).toHaveLength(2);
      expect(parsed[0].detectedNumber).toBe("1234567-89.2026.8.26.0100");
      expect(parsed[0].suggestedType).toBe("MEETING");
      expect(parsed[1].detectedNumber).toBe("7654321-10.2026.8.26.0200");
      expect(parsed[1].suggestedType).toBe("COURT_MOTION");
    });

    it("mantém um texto corrido como intimação única", () => {
      const parsed = parseIntimationText(
        "Intimação: o advogado deve apresentar contestação.\nProcesso 1234567-89.2026.8.26.0100"
      );

      expect(parsed).toHaveLength(1);
      expect(parsed[0].detectedNumber).toBe("1234567-89.2026.8.26.0100");
      expect(parsed[0].body).toContain("contestação");
    });

    it("devolve lista vazia para texto em branco", () => {
      expect(parseIntimationText("   \n  ")).toEqual([]);
    });
  });
});
