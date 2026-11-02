import { describe, expect, it } from "vitest";
import { availableImportTargets, IMPORT_TARGET_ORDER } from "./dataImport.constants";
import { detectColumns } from "./utils/columnMapping";

describe("availableImportTargets", () => {
  it("só oferece processos ao segmento jurídico", () => {
    expect(availableImportTargets("LAW_FIRM")).toContain("CASES");
    expect(availableImportTargets("BARBERSHOP")).not.toContain("CASES");
    expect(availableImportTargets(null)).not.toContain("CASES");
  });

  it("mantém produtos fora do escritório e dentro dos demais segmentos", () => {
    expect(availableImportTargets("LAW_FIRM")).not.toContain("PRODUCTS");
    expect(availableImportTargets("BARBERSHOP")).toContain("PRODUCTS");
  });

  it("reconhece as colunas usuais de processos", () => {
    const detected = detectColumns(
      ["Cliente", "WhatsApp", "Caso", "Processo", "Área", "Situação", "Prioridade", "Data de abertura", "Valor da causa"],
      "CASES",
      "LAW_FIRM",
    );

    expect(detected).toMatchObject({
      clientName: 0,
      clientWhatsapp: 1,
      caseName: 2,
      caseNumber: 3,
      practiceArea: 4,
      caseStatus: 5,
      casePriority: 6,
      openedAt: 7,
      claimedAmount: 8,
    });
  });

  it("processa processos antes da agenda", () => {
    expect(IMPORT_TARGET_ORDER.indexOf("CASES")).toBeLessThan(
      IMPORT_TARGET_ORDER.indexOf("APPOINTMENTS"),
    );
    expect(IMPORT_TARGET_ORDER.indexOf("CLIENTS")).toBeLessThan(
      IMPORT_TARGET_ORDER.indexOf("CASES"),
    );
  });
});
