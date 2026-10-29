/**
 * Detecção automática de colunas e rótulos por segmento.
 *
 * O dono não precisa mapear coluna por coluna: o assistente compara o
 * cabeçalho da planilha com os sinônimos do campo de destino e já sugere o
 * mapeamento. O dono só ajusta o que quiser.
 *
 * A comparação é feita sobre o cabeçalho normalizado (minúsculas, sem acento
 * e sem pontuação), por isso "Data do Atendimento" casa com "data".
 */
import { IMPORT_FIELDS_BY_TARGET } from "../dataImport.constants";
import type {
  ImportFieldDefinition,
  ImportFieldKey,
  ImportTargetType,
} from "../dataImport.types";
import { getSegmentConfig } from "@/shared/segments";
import type { BusinessSegment } from "@prisma/client";

/** Normaliza texto para comparação: minúsculas, sem acento e sem pontuação. */
export function normalizeHeaderText(value: string): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Sugere o mapeamento coluna → campo.
 * A primeira coluna que casa com um sinônimo vence; cada coluna é usada uma
 * vez só.
 */
export function detectColumns(
  headers: string[],
  targetType: ImportTargetType,
  segment?: BusinessSegment | null,
): Partial<Record<ImportFieldKey, number>> {
  const definitions = availableFields(targetType, segment);
  const normalizedHeaders = headers.map((header) => normalizeHeaderText(header));
  const usedColumns = new Set<number>();
  const detected: Partial<Record<ImportFieldKey, number>> = {};

  // 1ª passada: casamento exato.
  for (const definition of definitions) {
    const synonyms = definition.synonyms.map(normalizeHeaderText);
    for (let column = 0; column < normalizedHeaders.length; column += 1) {
      if (usedColumns.has(column)) continue;
      const header = normalizedHeaders[column];
      if (!header) continue;
      if (synonyms.includes(header)) {
        detected[definition.key] = column;
        usedColumns.add(column);
        break;
      }
    }
  }

  // 2ª passada: casamento parcial (cabeçalho contém o sinônimo ou vice-versa).
  for (const definition of definitions) {
    if (detected[definition.key] !== undefined) continue;
    const synonyms = definition.synonyms.map(normalizeHeaderText).filter((s) => s.length >= 4);
    for (let column = 0; column < normalizedHeaders.length; column += 1) {
      if (usedColumns.has(column)) continue;
      const header = normalizedHeaders[column];
      if (!header) continue;
      const matches = synonyms.some(
        (synonym) => header.includes(synonym) || synonym.includes(header),
      );
      if (matches) {
        detected[definition.key] = column;
        usedColumns.add(column);
        break;
      }
    }
  }

  return detected;
}

/** Campos disponíveis para o alvo, respeitando o perfil auxiliar do segmento. */
export function availableFields(
  targetType: ImportTargetType,
  segment?: BusinessSegment | null,
): ImportFieldDefinition[] {
  const definitions = IMPORT_FIELDS_BY_TARGET[targetType];
  if (!segment) return definitions.filter((definition) => !definition.requiresAuxiliaryProfile);
  const config = getSegmentConfig(segment);
  return definitions.filter(
    (definition) =>
      !definition.requiresAuxiliaryProfile ||
      definition.requiresAuxiliaryProfile === config.auxiliaryProfile,
  );
}

/**
 * Rótulo do campo para o segmento do salão — é o mesmo vocabulário usado no
 * resto do sistema ("atendimento" em barbearia, "serviço" em pet shop).
 */
export function getFieldLabel(
  definition: ImportFieldDefinition,
  segment?: BusinessSegment | null,
): string {
  const labels = getSegmentConfig(segment ?? "OTHER").labels;

  switch (definition.key) {
    case "name":
    case "clientName":
      return labels.client;
    case "serviceName":
      return labels.service;
    case "staffName":
      return labels.professional;
    case "durationMinutes":
      return `Duração (minutos)`;
    default:
      return definition.label;
  }
}

/** Converte o mapa `{índice: campo}` em `{campo: índice}` (formato do wizard). */
export function invertColumnMapping(
  columns: Record<string, string>,
): Record<ImportFieldKey, number> {
  const inverted: Partial<Record<ImportFieldKey, number>> = {};
  for (const [column, field] of Object.entries(columns)) {
    const index = Number(column);
    if (!Number.isInteger(index) || index < 0) continue;
    inverted[field as ImportFieldKey] = index;
  }
  return inverted as Record<ImportFieldKey, number>;
}

/** Converte `{campo: índice}` em `{índice: campo}` (formato salvo no banco). */
export function toColumnMap(
  columns: Partial<Record<ImportFieldKey, number>>,
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const [field, index] of Object.entries(columns)) {
    if (typeof index !== "number" || !Number.isInteger(index) || index < 0) continue;
    map[String(index)] = field;
  }
  return map;
}
