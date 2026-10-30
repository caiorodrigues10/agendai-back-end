import { describe, expect, it } from "vitest";
import {
  CSV_SHEET_NAME,
  orderPlanSheets,
  planBatchTargetType,
  readPlan,
  serializePlan,
  sheetKey,
} from "./importPlan";
import type { ImportPlan } from "./dataImport.types";

const OPCOES = {
  updateExisting: true,
  countFinancialValues: false,
  sendReviewInvitations: false,
  includeCase: false,
  replaceExistingSchedules: false,
  importTimeOffAsPending: false,
  updateExistingProducts: false,
  createProductCategories: true,
  sendFiadoReminders: false,
};

describe("plano do lote", () => {
  it("usa 'CSV' como chave quando a planilha não tem aba", () => {
    expect(sheetKey(null)).toBe(CSV_SHEET_NAME);
    expect(sheetKey("")).toBe(CSV_SHEET_NAME);
    expect(sheetKey("  ")).toBe(CSV_SHEET_NAME);
    expect(sheetKey("Clientes")).toBe("Clientes");
  });

  it("lê o plano v2 (multi-aba)", () => {
    const plan = readPlan({
      targetType: "MIXED",
      sheetName: "Clientes",
      mapping: {
        version: 2,
        sheets: [
          { sheetName: "Clientes", targetType: "CLIENTS", columns: { "0": "name" }, options: OPCOES },
          { sheetName: "Produtos", targetType: "PRODUCTS", columns: { "0": "productName" }, options: OPCOES },
        ],
      },
    });

    expect(plan.sheets).toHaveLength(2);
    expect(plan.sheets[0].targetType).toBe("CLIENTS");
    expect(plan.sheets[1].targetType).toBe("PRODUCTS");
  });

  it("cai no formato legado quando o lote é da Fase 1", () => {
    const plan = readPlan({
      targetType: "CLIENTS",
      sheetName: null,
      mapping: { columns: { "0": "name", "1": "whatsapp" }, options: OPCOES },
    });

    expect(plan.sheets).toHaveLength(1);
    expect(plan.sheets[0].targetType).toBe("CLIENTS");
    expect(plan.sheets[0].sheetName).toBeNull();
    expect(plan.sheets[0].columns).toEqual({ "0": "name", "1": "whatsapp" });
  });

  it("marca o lote como MIXED quando as abas são de tipos diferentes", () => {
    const plan: ImportPlan = {
      sheets: [
        { sheetName: "Clientes", targetType: "CLIENTS", columns: {}, options: OPCOES },
        { sheetName: "Produtos", targetType: "PRODUCTS", columns: {}, options: OPCOES },
      ],
    };

    expect(planBatchTargetType(plan)).toBe("MIXED");
  });

  it("mantém o tipo único quando todas as abas são do mesmo tipo", () => {
    const plan: ImportPlan = {
      sheets: [
        { sheetName: "A", targetType: "CLIENTS", columns: {}, options: OPCOES },
        { sheetName: "B", targetType: "CLIENTS", columns: {}, options: OPCOES },
      ],
    };

    expect(planBatchTargetType(plan)).toBe("CLIENTS");
  });

  it("ordena as abas pela ordem de dependência, não pela escolha do dono", () => {
    const plan: ImportPlan = {
      sheets: [
        { sheetName: "Agenda", targetType: "APPOINTMENTS", columns: {}, options: OPCOES },
        { sheetName: "Clientes", targetType: "CLIENTS", columns: {}, options: OPCOES },
        { sheetName: "Serviços", targetType: "SERVICES", columns: {}, options: OPCOES },
      ],
    };

    const ordered = orderPlanSheets(plan).map((sheet) => sheet.targetType);
    expect(ordered).toEqual(["SERVICES", "CLIENTS", "APPOINTMENTS"]);
  });

  it("preserva a ordem escolhida entre abas do mesmo tipo", () => {
    const plan: ImportPlan = {
      sheets: [
        { sheetName: "B", targetType: "CLIENTS", columns: {}, options: OPCOES },
        { sheetName: "A", targetType: "CLIENTS", columns: {}, options: OPCOES },
      ],
    };

    const ordered = orderPlanSheets(plan).map((sheet) => sheet.sheetName);
    expect(ordered).toEqual(["B", "A"]);
  });

  it("grava e relê o plano sem perder informação", () => {
    const plan: ImportPlan = {
      sheets: [
        { sheetName: "Clientes", targetType: "CLIENTS", columns: { "0": "name" }, options: OPCOES },
      ],
    };

    const stored = serializePlan(plan);
    const reread = readPlan({ targetType: "MIXED", sheetName: null, mapping: stored });

    expect(reread.sheets[0].columns).toEqual({ "0": "name" });
    expect(reread.sheets[0].options).toEqual(OPCOES);
  });
});
