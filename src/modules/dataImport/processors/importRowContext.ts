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
  /** Usuário que enviou o arquivo (aprovador da folga, autor do estoque). */
  actingUserId: string;
  /** Lote que está sendo processado (vínculo do movimento de estoque). */
  batchId: string;
}

/** Resultado do processamento de uma linha. */
export interface ProcessedRow {
  status: "IMPORTED" | "SKIPPED" | "FAILED";
  entityType?:
    | "CLIENT"
    | "SERVICE"
    | "APPOINTMENT"
    | "CASE"
    | "STAFF_SCHEDULE"
    | "SHOP_SCHEDULE"
    | "TIME_OFF"
    | "PRODUCT"
    | "PRODUCT_CATEGORY"
    | "SERVICE_PACKAGE"
    | "CLIENT_PACKAGE"
    | "FIADO"
    | null;
  entityId?: string | null;
  /** Campo da planilha que causou a falha (quando a linha foi rejeitada). */
  field?: ImportFieldKey | null;
  message?: string | null;
  /** Cliente criado junto com o registro (importação de agendamentos). */
  createdClientId?: string | null;
  /** Caso criado junto com o registro (segmento de advocacia). */
  createdCaseId?: string | null;
  /** Avisos que não impedem a importação (ex.: pausa de almoço não suportada). */
  warnings?: string[];
  /**
   * Valor anterior do registro, quando a importação **substituiu** algo que já
   * existia (ex.: o horário do dia). O desfazer restaura esse valor.
   */
  previousState?: Record<string, unknown> | null;
  /** Categoria de produto criada junto com o registro. */
  createdCategoryId?: string | null;
  /** Produto criado junto com o registro. */
  createdProductId?: string | null;
  /** Pacote do catálogo criado junto com o registro. */
  createdPackageId?: string | null;
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
