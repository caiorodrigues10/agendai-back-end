/**
 * Helpers for StockUnit enum: mapping, label resolution, and payload normalization.
 */

export type StockUnit = "UNIT" | "ML" | "L" | "G" | "KG" | "BOX" | "PACK" | "OTHER";

/** Short pt-BR label per StockUnit. */
export const STOCK_UNIT_LABELS: Record<StockUnit, string> = {
  UNIT: "un",
  ML: "ml",
  L: "L",
  G: "g",
  KG: "kg",
  BOX: "cx",
  PACK: "pct",
  OTHER: "",
};

/**
 * Map a free-text unitLabel (case-insensitive, trimmed) to its StockUnit.
 * Returns `null` when no known mapping matches.
 *
 * IMPORTANT: Keep in sync with the backfill SQL in
 * prisma/migrations/20260919120000_add_product_unit_expiration_lot/migration.sql
 */
export function unitFromLabel(label: string | null | undefined): StockUnit | null {
  const norm = (label ?? "").trim().toLowerCase();
  if (!norm) return null;
  const map: Record<string, StockUnit> = {
    un: "UNIT", und: "UNIT", unid: "UNIT", unidade: "UNIT", unidades: "UNIT",
    ml: "ML",
    l: "L", lt: "L", litro: "L", litros: "L",
    g: "G", gr: "G", grama: "G", gramas: "G",
    kg: "KG", quilo: "KG", quilos: "KG",
    cx: "BOX", caixa: "BOX", caixas: "BOX",
    pct: "PACK", pacote: "PACK", pacotes: "PACK",
  };
  return map[norm] ?? null;
}

/**
 * Resolve `unit` and `unitLabel` fields from a payload (create/update).
 *
 * Rules:
 * - If payload provides `unit` (not OTHER): `unitLabel` = label of that unit.
 * - If payload provides `unit` = OTHER: `unitLabel` = payload.unitLabel (required).
 * - If payload provides only `unitLabel` (no `unit`): derive `unit` from label via unitFromLabel;
 *   if still not recognized, use OTHER and keep the custom label.
 * - If neither is provided: returns undefined (no change).
 */
export function resolveUnitFields(payload: {
  unit?: StockUnit | string | null;
  unitLabel?: string | null;
}): { unit?: StockUnit; unitLabel?: string | null } | undefined {
  const hasUnit = payload.unit !== undefined && payload.unit !== null;
  const hasLabel = payload.unitLabel !== undefined && payload.unitLabel !== null;

  if (!hasUnit && !hasLabel) return undefined;

  if (hasUnit && payload.unit !== null) {
    const unit = payload.unit as StockUnit;
    if (unit === "OTHER") {
      const label = (payload.unitLabel ?? "").trim();
      if (!label) return undefined; // validation should reject this upstream
      return { unit: "OTHER", unitLabel: label };
    }
    return { unit, unitLabel: STOCK_UNIT_LABELS[unit] ?? "un" };
  }

  // Only unitLabel provided (legacy payload)
  const label = (payload.unitLabel ?? "").trim();
  if (!label) return undefined;
  const derived = unitFromLabel(label);
  if (derived) {
    return { unit: derived, unitLabel: STOCK_UNIT_LABELS[derived] };
  }
  return { unit: "OTHER", unitLabel: label };
}
