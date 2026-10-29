/**
 * Contexto compartilhado pelos processadores de linha.
 *
 * Um processador recebe a linha já lida (texto puro) e decide o que criar.
 * Tudo acontece dentro da transação do lote: ou a linha entra inteira, ou
 * nada entra.
 */
import type { ImportFieldKey, ImportOptions, ImportTargetType } from "../dataImport.types";
import type { BusinessSegment } from "@prisma/client";

export interface ImportRowContext {
  /** Cabeçalhos da planilha (índice = posição da coluna). */
  headers: string[];
  /** Campo de destino → coluna (índice) onde ele está na planilha. */
  columnMap: Map<ImportFieldKey, number>;
  options: ImportOptions;
  segment: BusinessSegment | null;
}

/** Resultado do processamento de uma linha. */
export interface ProcessedRow {
  status: "IMPORTED" | "SKIPPED" | "FAILED";
  entityType?: "CLIENT" | "SERVICE" | "APPOINTMENT" | "CASE" | null;
  entityId?: string | null;
  message?: string | null;
  /** Cliente criado junto com o registro (importação de agendamentos). */
  createdClientId?: string | null;
  /** Caso criado junto com o registro (segmento de advocacia). */
  createdCaseId?: string | null;
}

/** Valor da célula correspondente a um campo (texto já saneado). */
export function cellValue(
  row: Record<string, string>,
  context: ImportRowContext,
  field: ImportFieldKey,
): string {
  const index = context.columnMap.get(field);
  if (index === undefined) return "";
  const header = context.headers[index];
  if (!header) return "";
  const value = row[header];
  return typeof value === "string" ? value.trim() : "";
}

/** Campos que o dono mapeou. */
export function mappedFields(context: ImportRowContext): ImportFieldKey[] {
  return [...context.columnMap.keys()];
}

/** Alvo do lote. */
export type ProcessorTarget = ImportTargetType;
