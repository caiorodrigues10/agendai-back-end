/**
 * Parser de CSV sem dependência externa.
 *
 * Cobre o que planilha de verdade traz: separador variável (`,` `;` `\t`),
 * encoding (UTF-8 com/sem BOM, UTF-16, Latin-1), aspas com escape por
 * aspas duplicadas e quebras de linha dentro do campo.
 *
 * O parser é deliberadamente estrito: arquivo malformado vira erro claro, não
 * dado corrompido silencioso.
 */
import { MAX_IMPORT_CELL_LENGTH, MAX_IMPORT_COLUMNS } from "../dataImport.constants";
import { AppError } from "@/shared/errors/AppError";

export interface CsvParseResult {
  headers: string[];
  rows: string[][];
  separator: string;
}

/** Separadores candidatos, do mais provável para o menos. */
const SEPARATOR_CANDIDATES = [";", ",", "\t", "|"];

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const UTF16_LE_BOM = Buffer.from([0xff, 0xfe]);
const UTF16_BE_BOM = Buffer.from([0xfe, 0xff]);

/** Decodifica o buffer respeitando BOM e validade de UTF-8. */
export function decodeCsvBuffer(buffer: Buffer): string {
  if (buffer.subarray(0, 3).equals(UTF8_BOM)) {
    return buffer.subarray(3).toString("utf8");
  }
  if (buffer.subarray(0, 2).equals(UTF16_LE_BOM)) {
    return buffer.subarray(2).toString("utf16le");
  }
  if (buffer.subarray(0, 2).equals(UTF16_BE_BOM)) {
    return decodeUtf16Be(buffer.subarray(2));
  }

  const asUtf8 = buffer.toString("utf8");
  // Se o UTF-8 decodificou com U+FFFD, o conteúdo não era UTF-8 válido:
  // usa Latin-1 (preserva os acentos que o dono realmente digitou).
  return asUtf8.includes("\uFFFD") ? buffer.toString("latin1") : asUtf8;
}

function decodeUtf16Be(buffer: Buffer): string {
  const swapped = Buffer.from(buffer);
  swapped.swap16();
  return swapped.toString("utf16le");
}

/** Escolhe o separador contando ocorrências fora de aspas. */
export function detectSeparator(text: string): string {
  const firstLines = text.split(/\r?\n/).slice(0, 5).join("\n");
  let best = ",";
  let bestCount = 0;
  for (const candidate of SEPARATOR_CANDIDATES) {
    const count = countOutsideQuotes(firstLines, candidate);
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

function countOutsideQuotes(text: string, char: string): number {
  let count = 0;
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const current = text[i];
    if (current === '"') {
      if (inQuotes && text[i + 1] === '"') {
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && current === char) count += 1;
  }
  return count;
}

/**
 * Divide o texto em linhas de células. Respeita aspas duplas, escape por
 * aspas duplicadas (`""` → `"`) e quebras de linha dentro do campo.
 */
export function parseCsvRows(text: string, separator: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let sawAnyChar = false;

  const pushField = () => {
    row.push(field.trim());
    field = "";
  };
  const pushRow = () => {
    pushField();
    // Linha totalmente vazia no fim do arquivo não vira registro.
    if (row.length === 1 && row[0] === "") {
      row = [];
      return;
    }
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    sawAnyChar = true;

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
          continue;
        }
        inQuotes = false;
        continue;
      }
      field += char;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === separator) {
      pushField();
      continue;
    }
    if (char === "\r") {
      if (text[i + 1] === "\n") i += 1;
      pushRow();
      sawAnyChar = false;
      continue;
    }
    if (char === "\n") {
      pushRow();
      sawAnyChar = false;
      continue;
    }
    field += char;
  }

  if (field.length > 0 || row.length > 0 || (sawAnyChar && rows.length === 0)) {
    pushRow();
  }

  return rows;
}

/**
 * Lê o CSV e devolve cabeçalhos + linhas.
 * Linhas com menos células que o cabeçalho são preenchidas com vazio;
 * células excedentes são descartadas (limite de colunas).
 */
export function parseCsv(buffer: Buffer): CsvParseResult {
  const text = decodeCsvBuffer(buffer);
  if (!text.trim()) {
    throw new AppError("O arquivo enviado está vazio.", 400);
  }

  const separator = detectSeparator(text);
  const rawRows = parseCsvRows(text, separator);
  if (!rawRows.length) {
    throw new AppError("Não foi possível ler o conteúdo do CSV.", 400);
  }

  const headers = normalizeHeaders(rawRows[0]);
  const rows = rawRows.slice(1).map((cells) => {
    const limited = cells.slice(0, MAX_IMPORT_COLUMNS);
    while (limited.length < headers.length) limited.push("");
    return limited.slice(0, headers.length);
  });

  return { headers, rows, separator };
}

/**
 * Normaliza os cabeçalhos: remove quebras de linha, corta o tamanho máximo e
 * garante nomes únicos (sufixo numérico) para não perder colunas.
 */
export function normalizeHeaders(rawHeaders: string[]): string[] {
  const seen = new Map<string, number>();
  return rawHeaders.map((raw, index) => {
    const base = String(raw ?? "")
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, MAX_IMPORT_CELL_LENGTH) || `Coluna ${index + 1}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base} (${count + 1})`;
  });
}
