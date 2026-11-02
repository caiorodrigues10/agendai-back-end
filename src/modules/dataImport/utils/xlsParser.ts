/**
 * Leitor de Excel 97-2003 (.xls — OLE2/BIFF8).
 *
 * Por que uma lib separada: o `exceljs` lê apenas OOXML (.xlsx/.xlsm). O
 * `.xls` é um formato binário de outra geração e precisa de outro leitor.
 * Usamos o SheetJS Community Edition 0.20.3 (mirror `@e965/xlsx`, Apache-2.0),
 * que é a versão **corrigida** — o pacote `xlsx` do registry npm está
 * parado em 0.18.5, com CVEs de prototype pollution e ReDoS.
 *
 * O leitor só extrai valores: nenhuma fórmula é avaliada e nada é executado.
 */
import * as XLSX from "@e965/xlsx";
import { AppError } from "@/shared/errors/AppError";
import {
  MAX_IMPORT_CELL_LENGTH,
  MAX_IMPORT_COLUMNS,
  MAX_IMPORT_ROWS,
  MAX_IMPORT_SHEETS,
} from "../dataImport.constants";
import { buildSheetMatrix } from "./sheetMatrix";
import { inspectOle2 } from "./oleGuard";

/** Uma aba lida do .xls. */
export interface XlsSheetResult {
  name: string;
  headers: string[];
  rows: string[][];
}

/** Converte o valor de uma célula em texto. */
function cellToText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.w === "string") return record.w.trim(); // texto rico
    if (typeof record.v === "string") return record.v.trim();
    if (typeof record.v === "number") return String(record.v);
    if (record.t === "e") return String(record.w ?? "erro").trim();
    return "";
  }
  return String(value).trim();
}

/** Lê as abas de um arquivo .xls. */
export async function parseXls(buffer: Buffer): Promise<XlsSheetResult[]> {
  // Guarda do container OLE2: o arquivo pode declarar streams gigantes.
  inspectOle2(buffer);

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer", cellDates: false, cellFormula: false });
  } catch {
    throw new AppError(
      "Não foi possível ler o arquivo .xls (Excel 97-2003) enviado. Salve como .xlsx ou .csv e tente de novo.",
      400,
    );
  }

  const sheetNames = workbook.SheetNames ?? [];
  if (!sheetNames.length) {
    throw new AppError("A planilha .xls enviada não tem abas com conteúdo.", 400);
  }
  if (sheetNames.length > MAX_IMPORT_SHEETS) {
    throw new AppError(
      `A planilha tem ${sheetNames.length} abas; o limite é ${MAX_IMPORT_SHEETS}.`,
      400,
    );
  }

  const sheets: XlsSheetResult[] = [];
  for (const sheetName of sheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const matrix: string[][] = [];
    const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1");
    const maxRow = Math.min(range.e.r, range.s.r + MAX_IMPORT_ROWS + 1);
    const maxCol = Math.min(range.e.c, MAX_IMPORT_COLUMNS - 1);

    for (let row = range.s.r; row <= maxRow; row += 1) {
      const cells: string[] = [];
      for (let col = range.s.c; col <= maxCol; col += 1) {
        const address = XLSX.utils.encode_cell({ r: row, c: col });
        const cell = sheet[address];
        cells.push(cell ? cellToText(cell.v).slice(0, MAX_IMPORT_CELL_LENGTH) : "");
      }
      while (cells.length && cells[cells.length - 1] === "") cells.pop();
      if (!cells.some((cell) => cell !== "")) continue;
      matrix.push(cells);
      if (matrix.length > MAX_IMPORT_ROWS + 1) break;
    }

    if (!matrix.length) continue;

    const { headers, rows } = buildSheetMatrix(matrix);

    if (rows.length > MAX_IMPORT_ROWS) {
      throw new AppError(
        `A aba "${sheetName}" tem ${rows.length} linhas; o limite é ${MAX_IMPORT_ROWS}.`,
        400,
      );
    }

    sheets.push({ name: sheetName, headers, rows });
  }

  if (!sheets.length) {
    throw new AppError("A planilha .xls enviada não tem abas com conteúdo.", 400);
  }
  return sheets;
}
