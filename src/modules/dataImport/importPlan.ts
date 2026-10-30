/**
 * Plano do lote de importação: o que cada aba da planilha importa.
 *
 * Uma planilha pode ter abas de tipos diferentes (clientes, serviços,
 * produtos, horários...). O plano é guardado no JSON do mapeamento do lote:
 *
 *   • **v2** (Fase 2) — `{ version: 2, sheets: [...] }`, uma entrada por aba;
 *   • **legado** (Fase 1) — `{ columns, options }`, uma única aba.
 *
 * O formato legado continua sendo lido: lotes já no banco (e o teste de
 * integração da Fase 1) não quebram com a mudança.
 *
 * A ordem de processamento NÃO é a ordem em que o dono escolheu: as abas são
 * processadas na ordem de dependência (`IMPORT_TARGET_ORDER`) — serviço antes
 * da agenda, pacote do catálogo antes do saldo do cliente, cliente antes do
 * fiado.
 */
import { AppError } from "@/shared/errors/AppError";
import { DEFAULT_IMPORT_OPTIONS, IMPORT_TARGET_ORDER } from "./dataImport.constants";
import type {
  ImportBatchTargetType,
  ImportOptions,
  ImportPlan,
  ImportSheetPlan,
  ImportTargetType,
} from "./dataImport.types";

/** Rótulo usado nas linhas de resultado quando o arquivo é CSV. */
export const CSV_SHEET_NAME = "CSV";

/** Chave estável de uma aba (CSV e abas de mesmo nome não colidem). */
export function sheetKey(sheetName: string | null | undefined): string {
  return sheetName?.trim() || CSV_SHEET_NAME;
}

/** Lê o plano do lote, aceitando o formato legado da Fase 1. */
export function readPlan(batch: {
  targetType: string;
  sheetName: string | null;
  mapping: unknown;
}): ImportPlan {
  const stored = batch.mapping as
    | { version?: number; sheets?: unknown; columns?: unknown; options?: unknown }
    | null
    | undefined;

  if (stored && Array.isArray(stored.sheets) && stored.sheets.length) {
    const sheets = stored.sheets
      .map((entry) => toSheetPlan(entry))
      .filter((entry): entry is ImportSheetPlan => entry !== null);
    if (sheets.length) return { sheets };
  }

  // Formato legado: uma única aba com o alvo gravado no lote.
  const columns = (stored?.columns ?? null) as Record<string, string> | null;
  const options = (stored?.options ?? null) as Partial<ImportOptions> | null;
  if (!columns || !options) {
    throw new AppError("Mapeie as colunas da planilha antes de continuar.", 400);
  }

  const targetType = batch.targetType as ImportTargetType;
  if (!IMPORT_TARGET_ORDER.includes(targetType)) {
    throw new AppError("Mapeamento do lote ausente.", 400);
  }

  return {
    sheets: [
      {
        sheetName: batch.sheetName,
        targetType,
        columns,
        options: { ...DEFAULT_IMPORT_OPTIONS, ...options },
      },
    ],
  };
}

/** Converte uma entrada gravada em uma aba do plano (ignora o que não serve). */
function toSheetPlan(entry: unknown): ImportSheetPlan | null {
  if (!entry || typeof entry !== "object") return null;
  const raw = entry as {
    sheetName?: unknown;
    targetType?: unknown;
    columns?: unknown;
    options?: unknown;
  };

  const targetType = raw.targetType as ImportTargetType;
  if (!IMPORT_TARGET_ORDER.includes(targetType)) return null;

  const columns: Record<string, string> = {};
  if (raw.columns && typeof raw.columns === "object") {
    for (const [column, field] of Object.entries(raw.columns as Record<string, unknown>)) {
      if (!/^\d+$/.test(column)) continue;
      if (typeof field !== "string" || !field) continue;
      columns[column] = field;
    }
  }

  const options = (raw.options ?? {}) as Partial<ImportOptions>;

  return {
    sheetName: typeof raw.sheetName === "string" ? raw.sheetName : null,
    targetType,
    columns,
    options: { ...DEFAULT_IMPORT_OPTIONS, ...options },
  };
}

/** Grava o plano no formato v2 (o que o lote guarda no banco). */
export function serializePlan(plan: ImportPlan): Record<string, unknown> {
  return {
    version: 2,
    sheets: plan.sheets.map((sheet) => ({
      sheetName: sheet.sheetName,
      targetType: sheet.targetType,
      columns: sheet.columns,
      options: sheet.options,
    })),
  };
}

/**
 * Alvo gravado no lote: o tipo único quando todas as abas são do mesmo tipo,
 * "MIXED" quando o lote mistura tipos.
 */
export function planBatchTargetType(plan: ImportPlan): ImportBatchTargetType {
  const targets = new Set(plan.sheets.map((sheet) => sheet.targetType));
  if (targets.size === 1) return plan.sheets[0].targetType;
  return "MIXED";
}

/**
 * Abas na ordem de processamento (dependência), preservando a ordem escolhida
 * pelo dono entre abas do mesmo tipo.
 */
export function orderPlanSheets(plan: ImportPlan): ImportSheetPlan[] {
  return [...plan.sheets].sort((a, b) => {
    const diff = IMPORT_TARGET_ORDER.indexOf(a.targetType) - IMPORT_TARGET_ORDER.indexOf(b.targetType);
    if (diff !== 0) return diff;
    return plan.sheets.indexOf(a) - plan.sheets.indexOf(b);
  });
}

/** Opções padrão de uma aba (o dono pode mudar por aba). */
export function defaultSheetOptions(): ImportOptions {
  return { ...DEFAULT_IMPORT_OPTIONS };
}
