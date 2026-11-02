/**
 * Leitor de PDF com texto selecionável.
 *
 * O PDF é um desenho: o texto tem posição (x, y) na página. Para virar
 * planilha, os itens de texto são agrupados em **linhas** (mesma altura) e
 * depois em **colunas** (mesma posição horizontal).
 *
 * PDF escaneado (sem texto) não é planilha ainda: a mensagem aponta para a
 *extração por imagem (Fase 2).
 */
import { extractTextItems, getDocumentProxy } from "unpdf";
import { AppError } from "@/shared/errors/AppError";
import {
  MAX_IMPORT_CELL_LENGTH,
  MAX_IMPORT_COLUMNS,
  MAX_IMPORT_ROWS,
  MAX_IMPORT_SHEETS,
} from "../dataImport.constants";
import { buildSheetMatrix } from "./sheetMatrix";
import { inspectPdf } from "./pdfGuard";

/** Uma "aba" lida do PDF (o PDF não tem abas: é uma tabela só). */
export interface PdfSheetResult {
  name: string | null;
  headers: string[];
  rows: string[][];
}

/** Máximo de páginas aceitas (o dono não manda um relatório de 200 páginas). */
export const MAX_IMPORT_PDF_PAGES = 10;

/** Máximo de caracteres de texto extraídos do PDF. */
export const MAX_IMPORT_PDF_TEXT_CHARS = 2_000_000;

/** Item de texto com posição. */
type PositionedText = {
  str: string;
  x: number;
  y: number;
  height: number;
};

/** Agrupa itens em linhas pela altura (tolerância = metade da altura da fonte). */
function groupLines(items: PositionedText[]): PositionedText[][] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: PositionedText[][] = [];
  for (const item of sorted) {
    const line = lines.find((candidate) => {
      const reference = candidate[0];
      const tolerance = Math.max(2, Math.min(reference.height, item.height) * 0.6);
      return Math.abs(reference.y - item.y) <= tolerance;
    });
    if (line) line.push(item);
    else lines.push([item]);
  }
  return lines.map((line) => line.sort((a, b) => a.x - b.x));
}

/**
 * Descobre as colunas: agrupa os inícios de coluna (x) de todos os itens.
 *
 * Dois itens belong ao mesmo cluster quando a distância entre os x é menor
 * que um terço da largura do item — assim uma coluna é a faixa onde os
 * textos começam.
 */
function detectColumns(lines: PositionedText[][]): number[] {
  const starts = lines
    .flat()
    .filter((item) => item.str.trim().length)
    .map((item) => item.x)
    .sort((a, b) => a - b);

  if (!starts.length) return [];

  const clusters: Array<{ start: number; count: number }> = [];
  for (const x of starts) {
    const cluster = clusters[clusters.length - 1];
    const previous = clusters.length > 1 ? clusters[clusters.length - 2] : undefined;
    if (cluster && x - cluster.start < 12) {
      cluster.count += 1;
      cluster.start = Math.min(cluster.start, x);
      continue;
    }
    // Uma coluna que só aparece uma vez (célula isolada) não abre coluna nova
    // se a anterior já tem duas ou mais ocorrências.
    if (cluster && cluster.count < 2 && previous && x - previous.start < 60) {
      cluster.count += 1;
      continue;
    }
    clusters.push({ start: x, count: 1 });
  }
  return clusters.map((cluster) => cluster.start);
}

/** Texto de uma linha quebrado em colunas. */
function splitLine(line: PositionedText[], columns: number[]): string[] {
  if (columns.length <= 1) {
    // Sem posição útil: divide por espaços duplos (PDFs que "colam" as
    // colunas num único item de texto).
    const joined = line.map((item) => item.str).join("");
    return joined.split(/\s{2,}/).map((part) => part.trim());
  }

  const cells: string[] = [];
  for (const columnStart of columns) {
    const inColumn = line.filter((item) => item.x >= columnStart - 2 && item.x < columnStart + 200);
    if (!inColumn.length) {
      cells.push("");
      continue;
    }
    const nextStart = columns.find((start) => start > columnStart);
    const limit = nextStart === undefined ? Infinity : nextStart - 2;
    const belonging = inColumn.filter((item) => item.x < limit);
    cells.push(belonging.map((item) => item.str).join(" ").trim());
  }
  return cells;
}

/** Lê a tabela de um PDF com texto. */
export async function parsePdf(buffer: Buffer): Promise<PdfSheetResult[]> {
  if (!buffer.subarray(0, 5).equals(Buffer.from("%PDF-", "ascii"))) {
    throw new AppError("O arquivo enviado não é um PDF válido.", 400);
  }

  // Guarda de tamanho declarado: o PDF pode declarar objetos gigantes num
  // arquivo de poucos KB.
  inspectPdf(buffer);

  let proxy;
  try {
    proxy = await getDocumentProxy(new Uint8Array(buffer));
  } catch {
    throw new AppError("Não foi possível ler o PDF enviado.", 400);
  }

  // A contagem de páginas vem antes da extração: um PDF de 5.000 páginas não
  // pode ser lido inteiro para só depois ser recusado.
  if (proxy.numPages > MAX_IMPORT_PDF_PAGES) {
    throw new AppError(
      `O PDF tem ${proxy.numPages} páginas; o limite é ${MAX_IMPORT_PDF_PAGES}.`,
      400,
    );
  }

  let totalPages = 0;
  let items: PositionedText[][] = [];
  try {
    const extracted = await extractTextItems(proxy);
    totalPages = extracted.totalPages;
    items = extracted.items.map((page) =>
      page.map((item) => ({
        str: item.str,
        x: item.x,
        y: item.y,
        height: item.height || item.fontSize || 10,
      })),
    );
  } catch {
    throw new AppError("Não foi possível ler o texto do PDF enviado.", 400);
  }

  const extractedChars = items.reduce(
    (total, page) => total + page.reduce((sum, item) => sum + item.str.length, 0),
    0,
  );
  if (extractedChars > MAX_IMPORT_PDF_TEXT_CHARS) {
    throw new AppError(
      "O texto do PDF é grande demais para ser processado com segurança.",
      400,
    );
  }

  if (totalPages > MAX_IMPORT_PDF_PAGES) {
    throw new AppError(
      `O PDF tem ${totalPages} páginas; o limite é ${MAX_IMPORT_PDF_PAGES}.`,
      400,
    );
  }

  const allItems = items.flat();
  if (!allItems.some((item) => item.str.trim().length)) {
    throw new AppError(
      "Este PDF não tem texto selecionável (provavelmente é uma digitalização). Envie um PDF gerado por sistema ou use a planilha.",
      400,
    );
  }

  const matrix: string[][] = [];
  for (const page of items) {
    const lines = groupLines(page);
    const columns = detectColumns(lines);
    for (const line of lines) {
      const cells = splitLine(line, columns)
        .slice(0, MAX_IMPORT_COLUMNS)
        .map((cell) => cell.slice(0, MAX_IMPORT_CELL_LENGTH));
      while (cells.length && cells[cells.length - 1] === "") cells.pop();
      if (!cells.some((cell) => cell !== "")) continue;
      matrix.push(cells);
      if (matrix.length > MAX_IMPORT_ROWS + 1) break;
    }
    if (matrix.length > MAX_IMPORT_ROWS + 1) break;
  }

  if (!matrix.length) {
    throw new AppError("O PDF enviado não tem linhas de tabela legíveis.", 400);
  }

  const { headers, rows } = buildSheetMatrix(matrix);

  if (rows.length > MAX_IMPORT_ROWS) {
    throw new AppError(
      `O PDF tem ${rows.length} linhas; o limite é ${MAX_IMPORT_ROWS}.`,
      400,
    );
  }
  if (matrix.length > MAX_IMPORT_SHEETS * 1000) {
    throw new AppError("O PDF enviado tem conteúdo demais.", 400);
  }

  return [{ name: null, headers, rows }];
}
