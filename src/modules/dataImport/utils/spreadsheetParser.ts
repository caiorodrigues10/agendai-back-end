/**
 * Leitura unificada da planilha enviada (CSV ou XLSX).
 *
 * O arquivo fica em disco temporário entre as etapas do assistente — é o que
 * permite ao dono sair da tela e voltar depois sem reenviar o arquivo.
 */
import { readFile } from "node:fs/promises";
import type { ImportFileFormat, ParsedSpreadsheet } from "../dataImport.types";
import { AppError } from "@/shared/errors/AppError";
import { parseCsv } from "./csvParser";
import { parseXlsx } from "./xlsxParser";
import { MAX_IMPORT_ROWS } from "../dataImport.constants";

/** Lê e interpreta a planilha do disco. */
export async function readSpreadsheet(
  filePath: string,
  format: ImportFileFormat,
  sheetName?: string | null,
): Promise<ParsedSpreadsheet> {
  let buffer: Buffer;
  try {
    buffer = await readFile(filePath);
  } catch {
    throw new AppError(
      "O arquivo enviado não está mais disponível. Envie o arquivo novamente.",
      410,
    );
  }

  if (format === "CSV") {
    const parsed = parseCsv(buffer);
    if (parsed.rows.length > MAX_IMPORT_ROWS) {
      throw new AppError(
        `O arquivo tem ${parsed.rows.length} linhas; o limite é ${MAX_IMPORT_ROWS}.`,
        400,
      );
    }
    return {
      headers: parsed.headers,
      rows: parsed.rows.map((cells) => rowToRecord(parsed.headers, cells)),
      sheetNames: [],
      selectedSheet: null,
    };
  }

  const parsed = await parseXlsx(buffer, sheetName ?? null);
  return {
    headers: parsed.headers,
    rows: parsed.rows.map((cells) => rowToRecord(parsed.headers, cells)),
    sheetNames: parsed.sheetNames,
    selectedSheet: sheetName ?? parsed.sheetNames[0] ?? null,
  };
}

/**
 * Converte a linha em `{ cabeçalho: valor }`.
 * O objeto nasce sem prototype: cabeçalho de planilha é entrada não confiável.
 */
export function rowToRecord(headers: string[], cells: string[]): Record<string, string> {
  const record = Object.create(null) as Record<string, string>;
  headers.forEach((header, index) => {
    record[header] = cells[index] ?? "";
  });
  return record;
}

/** Lê só as primeiras linhas (prévia da etapa de mapeamento). */
export async function readSpreadsheetPreview(
  filePath: string,
  format: ImportFileFormat,
  sheetName?: string | null,
  limit = 20,
): Promise<ParsedSpreadsheet> {
  const parsed = await readSpreadsheet(filePath, format, sheetName);
  return { ...parsed, rows: parsed.rows.slice(0, limit) };
}
