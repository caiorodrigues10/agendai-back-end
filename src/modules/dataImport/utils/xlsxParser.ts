/**
 * Leitor de planilhas .xlsx.
 *
 * Usa `exceljs` (não o `xlsx` do npm, que está sem manutenção e tem CVEs
 * conhecidas). O arquivo já passou pela guarda de ZIP antes de chegar aqui,
 * então o tamanho descomprimido é limitado.
 *
 * Regras:
 *   • a primeira linha é o cabeçalho;
 *   • fórmulas nunca são avaliadas — entra o último valor literal guardado;
 *   • no máximo `MAX_IMPORT_SHEETS` abas e `MAX_IMPORT_ROWS` linhas são lidas;
 *   • o valor da célula vira sempre texto (a normalização vem depois).
 */
import ExcelJS from "exceljs";
import {
  MAX_IMPORT_CELL_LENGTH,
  MAX_IMPORT_COLUMNS,
  MAX_IMPORT_ROWS,
  MAX_IMPORT_SHEETS,
} from "../dataImport.constants";
import { AppError } from "@/shared/errors/AppError";
import { normalizeHeaders } from "./csvParser";

export interface XlsxParseResult {
  headers: string[];
  rows: string[][];
  sheetNames: string[];
}

/** Converte o valor de uma célula do exceljs em texto plano. */
export function cellToText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";

  if (typeof value === "object" && !(value instanceof Date)) {
    const rich = value as ExcelJS.CellRichTextValue;
    if (Array.isArray(rich.richText)) {
      return rich.richText.map((part) => part.text).join("").trim();
    }
    if ("text" in rich && typeof rich.text === "string") {
      return rich.text.trim();
    }
    if ("result" in rich) {
      return cellToText(rich.result as ExcelJS.CellValue);
    }
    if ("error" in rich && rich.error) {
      return String(rich.error).trim();
    }
    if ("hyperlink" in rich && typeof rich.hyperlink === "string") {
      return rich.hyperlink.trim();
    }
    return "";
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value).trim();
}

/**
 * Lê o workbook e devolve a primeira aba (ou a indicada).
 * `sheetName` opcional: quando informado, usa essa aba.
 */
export async function parseXlsx(
  buffer: Buffer,
  sheetName?: string | null,
): Promise<XlsxParseResult> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new AppError("Não foi possível ler a planilha enviada.", 400);
  }

  const worksheets = workbook.worksheets.filter((sheet) => sheet.state !== "veryHidden");
  if (!worksheets.length) {
    throw new AppError("A planilha enviada não tem abas com conteúdo.", 400);
  }
  if (worksheets.length > MAX_IMPORT_SHEETS) {
    throw new AppError(
      `A planilha tem ${worksheets.length} abas; o limite é ${MAX_IMPORT_SHEETS}.`,
      400,
    );
  }

  const sheetNames = worksheets.map((sheet) => sheet.name);
  const sheet = sheetName ? worksheets.find((item) => item.name === sheetName) : worksheets[0];
  if (!sheet) {
    throw new AppError("A aba escolhida não existe mais na planilha.", 400);
  }

  const matrix: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    if (matrix.length > MAX_IMPORT_ROWS + 1) return;
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      if (colNumber > MAX_IMPORT_COLUMNS) return;
      cells[colNumber - 1] = cellToText(cell.value).slice(0, MAX_IMPORT_CELL_LENGTH);
    });
    while (cells.length && cells[cells.length - 1] === "") cells.pop();
    if (cells.some((cell) => cell !== "")) matrix.push(cells);
  });

  if (!matrix.length) {
    throw new AppError("A aba escolhida está vazia.", 400);
  }

  const headers = normalizeHeaders(matrix[0]);
  const rows = matrix.slice(1).map((cells) => {
    const limited = cells.slice(0, headers.length);
    while (limited.length < headers.length) limited.push("");
    return limited.slice(0, headers.length);
  });

  if (rows.length > MAX_IMPORT_ROWS) {
    throw new AppError(
      `A planilha tem ${rows.length} linhas; o limite é ${MAX_IMPORT_ROWS}.`,
      400,
    );
  }

  return { headers, rows, sheetNames };
}
