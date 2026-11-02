/**
 * Leitor de OpenDocument Spreadsheet (.ods).
 *
 * O `.ods` é um ZIP cujo conteúdo está em `content.xml` (XML puro). Só as
 * células interessam para a importação: cabeçalho e valores. Estilo, fórmula
 * e宏 são ignorados — a planilha é lida como dado, nunca executada.
 */
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import { AppError } from "@/shared/errors/AppError";
import {
  MAX_IMPORT_CELL_LENGTH,
  MAX_IMPORT_COLUMNS,
  MAX_IMPORT_ROWS,
  MAX_IMPORT_SHEETS,
} from "../dataImport.constants";
import { buildSheetMatrix } from "./sheetMatrix";

/** Uma aba lida do .ods. */
export interface OdsSheetResult {
  name: string;
  headers: string[];
  rows: string[][];
}

/** Repetição máxima aceita para célula/linha repetida (planilha traiçoeira). */
const MAX_REPEAT = 1000;

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  parseAttributeValue: false,
  // O texto da célula é DADO, nunca número: "11987654321" tem que continuar
  // string (senão o telefone vira Number e some o zero à esquerda).
  parseTagValue: false,
  trimValues: true,
  isArray: (name) =>
    name === "table:table" ||
    name === "table:table-row" ||
    name === "table:table-cell" ||
    name === "text:p",
});

/** Achou um nó pelo nome, em qualquer profundidade. */
function findNodes(node: unknown, name: string): unknown[] {
  if (!node || typeof node !== "object") return [];
  const found: unknown[] = [];
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === name) {
      const list = Array.isArray(value) ? value : [value];
      found.push(...list);
      continue;
    }
    if (value && typeof value === "object") {
      found.push(...findNodes(value, name));
    }
  }
  return found;
}

/** Texto de uma célula: parágrafos (text:p) ou, na falta, office:value. */
function cellText(cell: Record<string, unknown>): string {
  const paragraphs = findNodes(cell, "text:p");
  const texts = paragraphs
    .map((paragraph) => paragraphText(paragraph))
    .filter((text) => text.length > 0);

  if (texts.length) return texts.join(" ").trim();

  const value = cell["@office:value"];
  if (typeof value === "string" && value.length) return value.trim();
  if (typeof value === "number") return String(value);

  const valueType = cell["@office:value-type"];
  if (valueType === "float" || valueType === "percentage" || valueType === "currency") {
    const raw = cell["@office:value"];
    return typeof raw === "number" ? String(raw) : "";
  }
  return "";
}

/**
 * Texto de um parágrafo (`text:p`).
 *
 * Quando o parágrafo tem um link (`text:a`), entra o **rótulo** do link — o
 * endereço (`xlink:href`) nunca entra no dado e nunca é resolvido (nenhuma
 * requisição de rede é feita ao ler a planilha).
 */
function paragraphText(paragraph: unknown): string {
  if (typeof paragraph === "string") return paragraph;
  if (typeof paragraph === "number") return String(paragraph);
  if (!paragraph || typeof paragraph !== "object") return "";

  const record = paragraph as Record<string, unknown>;
  if (typeof record["#text"] === "string") return record["#text"];

  const links = findNodes(record, "text:a");
  if (links.length) {
    return links
      .map((link) => {
        if (typeof link === "string") return link;
        const linkRecord = (link ?? {}) as Record<string, unknown>;
        return typeof linkRecord["#text"] === "string" ? linkRecord["#text"] : "";
      })
      .filter((text) => text.length > 0)
      .join(" ");
  }

  return "";
}

/** Quantas vezes a célula/linha se repete (padrão 1). */
function repeatCount(value: unknown): number {
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw < 1) return 1;
  return Math.min(Math.floor(raw), MAX_REPEAT);
}

/** Lê as abas de um arquivo .ods. */
export async function parseOds(buffer: Buffer): Promise<OdsSheetResult[]> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new AppError("Não foi possível ler o arquivo .ods enviado.", 400);
  }

  const contentFile = zip.file("content.xml");
  if (!contentFile) {
    throw new AppError(
      "O arquivo .ods não tem content.xml — não é uma planilha OpenDocument válida.",
      400,
    );
  }

  // O `mimetype` interno diz o que o arquivo é de verdade: um .odt (texto) tem
  // content.xml, mas não é planilha.
  const mimetypeFile = zip.file("mimetype");
  if (mimetypeFile) {
    const mimetype = (await mimetypeFile.async("string")).trim();
    if (mimetype && mimetype !== "application/vnd.oasis.opendocument.spreadsheet") {
      throw new AppError(
        "Este documento OpenDocument não é uma planilha (é um documento de texto). Envie a planilha exportada como .ods.",
        400,
      );
    }
  }

  const xml = await contentFile.async("string");
  if (!xml.includes("office:spreadsheet")) {
    throw new AppError(
      "O arquivo OpenDocument enviado não tem planilha dentro. Envie a planilha exportada como .ods.",
      400,
    );
  }

  // Célula coberta por mescla (`table:covered-table-cell`) é a continuação
  // vazia de uma célula mesclada. Renomear para `table:table-cell` mantém a
  // ordem das colunas: sem isso, as células cobertas iriam para o fim da
  // linha e a coluna de cada valor mudaria de lugar.
  const normalizedXml = xml.replace(/table:covered-table-cell/g, "table:table-cell");

  let document: unknown;
  try {
    document = xmlParser.parse(normalizedXml);
  } catch {
    throw new AppError("Não foi possível ler o conteúdo do arquivo .ods.", 400);
  }

  const tables = findNodes(document, "table:table");
  if (!tables.length) {
    throw new AppError("A planilha .ods enviada não tem abas com conteúdo.", 400);
  }
  if (tables.length > MAX_IMPORT_SHEETS) {
    throw new AppError(
      `A planilha tem ${tables.length} abas; o limite é ${MAX_IMPORT_SHEETS}.`,
      400,
    );
  }

  const sheets: OdsSheetResult[] = [];
  for (const table of tables) {
    const record = (table ?? {}) as Record<string, unknown>;
    const name = typeof record["@table:name"] === "string" ? record["@table:name"] : "Planilha";
    const rowNodes = findNodes(record, "table:table-row");

    const matrix: string[][] = [];
    for (const rowNode of rowNodes) {
      const rowRecord = (rowNode ?? {}) as Record<string, unknown>;
      const cells: string[] = [];
      const cellNodes = findNodes(rowRecord, "table:table-cell");

      for (const cellNode of cellNodes) {
        const cell = (cellNode ?? {}) as Record<string, unknown>;
        const text = cellText(cell).slice(0, MAX_IMPORT_CELL_LENGTH);
        const repeat = repeatCount(cell["@table:number-columns-repeated"]);
        for (let i = 0; i < repeat && cells.length < MAX_IMPORT_COLUMNS; i += 1) {
          cells.push(text);
        }
      }
      while (cells.length && cells[cells.length - 1] === "") cells.pop();
      if (!cells.some((cell) => cell !== "")) continue;

      const rowRepeat = repeatCount(rowRecord["@table:number-rows-repeated"]);
      for (let i = 0; i < rowRepeat && matrix.length <= MAX_IMPORT_ROWS; i += 1) {
        matrix.push([...cells]);
      }
      if (matrix.length > MAX_IMPORT_ROWS + 1) break;
    }

    if (!matrix.length) continue;

    const { headers, rows } = buildSheetMatrix(matrix);

    if (rows.length > MAX_IMPORT_ROWS) {
      throw new AppError(
        `A aba "${name}" tem ${rows.length} linhas; o limite é ${MAX_IMPORT_ROWS}.`,
        400,
      );
    }

    sheets.push({ name, headers, rows });
  }

  if (!sheets.length) {
    throw new AppError("A planilha .ods enviada não tem abas com conteúdo.", 400);
  }
  return sheets;
}
