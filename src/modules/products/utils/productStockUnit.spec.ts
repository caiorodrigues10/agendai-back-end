import { describe, it, expect } from "vitest";
import {
  STOCK_UNIT_LABELS,
  unitFromLabel,
  resolveUnitFields,
} from "./productStockUnit";
import type { StockUnit } from "./productStockUnit";

describe("STOCK_UNIT_LABELS", () => {
  it("maps every enum value to a label", () => {
    const units: StockUnit[] = ["UNIT", "ML", "L", "G", "KG", "BOX", "PACK", "OTHER"];
    for (const u of units) {
      expect(STOCK_UNIT_LABELS[u]).toBeDefined();
    }
  });

  it("OTHER has empty label (free-text)", () => {
    expect(STOCK_UNIT_LABELS.OTHER).toBe("");
  });
});

describe("unitFromLabel", () => {
  it("maps common labels to correct units", () => {
    expect(unitFromLabel("un")).toBe("UNIT");
    expect(unitFromLabel("Unidade")).toBe("UNIT");
    expect(unitFromLabel("UNIDADES")).toBe("UNIT");
    expect(unitFromLabel("ml")).toBe("ML");
    expect(unitFromLabel("Mililitro")).toBeNull(); // not in map
    expect(unitFromLabel("l")).toBe("L");
    expect(unitFromLabel("litro")).toBe("L");
    expect(unitFromLabel("litros")).toBe("L");
    expect(unitFromLabel("lt")).toBe("L");
    expect(unitFromLabel("g")).toBe("G");
    expect(unitFromLabel("grama")).toBe("G");
    expect(unitFromLabel("gramas")).toBe("G");
    expect(unitFromLabel("gr")).toBe("G");
    expect(unitFromLabel("kg")).toBe("KG");
    expect(unitFromLabel("quilo")).toBe("KG");
    expect(unitFromLabel("quilos")).toBe("KG");
    expect(unitFromLabel("cx")).toBe("BOX");
    expect(unitFromLabel("caixa")).toBe("BOX");
    expect(unitFromLabel("caixas")).toBe("BOX");
    expect(unitFromLabel("pct")).toBe("PACK");
    expect(unitFromLabel("pacote")).toBe("PACK");
    expect(unitFromLabel("pacotes")).toBe("PACK");
  });

  it("returns null for empty/null/undefined", () => {
    expect(unitFromLabel("")).toBeNull();
    expect(unitFromLabel(null)).toBeNull();
    expect(unitFromLabel(undefined)).toBeNull();
  });

  it("returns null for unknown labels", () => {
    expect(unitFromLabel("frasco")).toBeNull();
    expect(unitFromLabel("pote")).toBeNull();
    expect(unitFromLabel("kit")).toBeNull();
  });

  it("trims and lowercases before matching", () => {
    expect(unitFromLabel("  Unidade  ")).toBe("UNIT");
    expect(unitFromLabel("  KG  ")).toBe("KG");
  });
});

describe("resolveUnitFields", () => {
  it("returns undefined when neither unit nor unitLabel provided", () => {
    expect(resolveUnitFields({})).toBeUndefined();
    expect(resolveUnitFields({ unit: undefined, unitLabel: undefined })).toBeUndefined();
  });

  it("sets unitLabel from enum when unit is provided (non-OTHER)", () => {
    expect(resolveUnitFields({ unit: "ML" })).toEqual({ unit: "ML", unitLabel: "ml" });
    expect(resolveUnitFields({ unit: "KG" })).toEqual({ unit: "KG", unitLabel: "kg" });
    expect(resolveUnitFields({ unit: "UNIT" })).toEqual({ unit: "UNIT", unitLabel: "un" });
  });

  it("requires unitLabel when unit is OTHER", () => {
    const result = resolveUnitFields({ unit: "OTHER", unitLabel: "frasco" });
    expect(result).toEqual({ unit: "OTHER", unitLabel: "frasco" });
  });

  it("OTHER without unitLabel returns undefined (validation should catch upstream)", () => {
    expect(resolveUnitFields({ unit: "OTHER" })).toBeUndefined();
    expect(resolveUnitFields({ unit: "OTHER", unitLabel: "" })).toBeUndefined();
  });

  it("derives unit from unitLabel when only unitLabel is provided", () => {
    expect(resolveUnitFields({ unitLabel: "un" })).toEqual({ unit: "UNIT", unitLabel: "un" });
    expect(resolveUnitFields({ unitLabel: "litro" })).toEqual({ unit: "L", unitLabel: "L" });
    expect(resolveUnitFields({ unitLabel: "kg" })).toEqual({ unit: "KG", unitLabel: "kg" });
  });

  it("uses OTHER when unitLabel is not recognized", () => {
    expect(resolveUnitFields({ unitLabel: "frasco" })).toEqual({ unit: "OTHER", unitLabel: "frasco" });
  });

  it("unit takes precedence over unitLabel when both provided", () => {
    // unit=ML overrides unitLabel text
    const result = resolveUnitFields({ unit: "ML", unitLabel: "frasco" });
    expect(result).toEqual({ unit: "ML", unitLabel: "ml" });
  });
});
