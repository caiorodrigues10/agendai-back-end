/**
 * Monta "cabeçalho + linhas" a partir da matriz bruta de células.
 *
 * É o mesmo passo para todo formato (xlsx, xlsm, xls, ods, csv, pdf): por
 * isso ele mora num lugar só — assim o dono vê o mesmo resultado em qualquer
 * formato que ele enviar.
 */
import { AppError } from "@/shared/errors/AppError";
import { MAX_IMPORT_COLUMNS } from "../dataImport.constants";
import { normalizeHeaders } from "./csvParser";

/** Resultado da montagem. */
export interface SheetMatrixResult {
  headers: string[];
  rows: string[][];
  /** Linhas de capa antes do cabeçalho (título, logotipo, período). */
  preambleRows: number;
  /** Linhas de total/rodapé descartadas. */
  skippedTotalRows: number;
}

/**
 * A célula parece um número (para reconhecer linha de total)?
 *
 * Inteiro de 10 ou 11 dígitos **não** conta: é telefone (coluna de contato),
 * não valor — senão uma linha de cliente que se chama "Total Expressão" e tem
 * telefone na segunda coluna seria apagada como total.
 */
function looksNumeric(value: string): boolean {
  const text = value.trim();
  if (!text) return false;
  if (/^\d{10,11}$/.test(text)) return false;
  return /^-?\d{1,3}(\.\d{3})*(,\d{1,2})?$|^-?\d+(,\d{1,2})?$|^-?\d+(,\d+)?$/.test(text);
}

/**
 * A linha é de total/rodapé?
 *
 * Só quando a primeira célula começa com "total"/"totais"/"subtotal"/"soma"
 * **e** a linha tem algum valor numérico — assim um cliente chamado
 * "Total Expressão" não é apagado.
 */
export function looksLikeTotalRow(cells: string[]): boolean {
  const first = cells.find((cell) => cell.trim().length);
  if (!first) return false;
  if (!/^(total|totais|subtotal|grand\s*total|soma)\b/i.test(first.trim())) return false;
  return cells.some((cell) => looksNumeric(cell));
}

/**
 * A linha é de rodapé ("Gerado em 01/05/2026", "Exportado em …")?
 *
 * Só quando é uma linha de **uma célula só** (as outras colunas vazias) e a
 * primeira parece um rodapé. Uma linha de cliente tem nome **e** contato —
 * ela nunca é apagada por esta regra.
 */
export function looksLikeFooterRow(cells: string[]): boolean {
  const preenchidas = cells.filter((cell) => cell.trim().length);
  if (preenchidas.length !== 1) return false;
  if (cells.findIndex((cell) => cell.trim().length) !== 0) return false;
  return /^(gerado|exportado|impresso|atualizado|criado|gerado em)\b/i.test(
    preenchidas[0].trim(),
  );
}

/**
 * Monta a planilha a partir da matriz.
 *
 * - o cabeçalho é a primeira linha mais larga (com 2+ colunas);
 * - linhas anteriores são capa (contadas para o aviso);
 * - linhas de total/rodapé no fim são descartadas (contadas para o aviso);
 * - linhas curtas ganham vazio; excedentes são descartadas.
 */
export function buildSheetMatrix(matrix: string[][]): SheetMatrixResult {
  const linhas = matrix.filter((cells) => cells.some((cell) => cell.trim().length));
  if (!linhas.length) {
    throw new AppError("A planilha enviada não tem linhas com conteúdo.", 400);
  }

  const preenchidas = (cells: string[]) => cells.filter((cell) => cell.trim().length).length;

  // Largura de referência: a maior entre as primeiras linhas com conteúdo.
  // Serve para distinguir "cabeçalho" de "capa com duas palavras".
  const largura = linhas
    .slice(0, 10)
    .reduce((max, cells) => Math.max(max, preenchidas(cells)), 0);

  if (largura < 2) {
    throw new AppError(
      "Não encontrei uma tabela neste arquivo: precisa de pelo menos duas colunas com conteúdo.",
      400,
    );
  }

  // O cabeçalho é a primeira linha com 2+ colunas que ocupa pelo menos 60%
  // da largura de referência. Uma linha de título com duas palavras não
  // passa; a linha de cabeçalho passa.
  const minimo = Math.max(2, Math.ceil(largura * 0.6));
  const indiceCabecalho = linhas.findIndex((cells) => preenchidas(cells) >= minimo);

  const cabecalhoBruto = linhas[indiceCabecalho].slice(0, MAX_IMPORT_COLUMNS);
  const headers = normalizeHeaders(cabecalhoBruto);

  let skippedTotalRows = 0;
  const rows: string[][] = [];
  for (const cells of linhas.slice(indiceCabecalho + 1)) {
    if (looksLikeTotalRow(cells) || looksLikeFooterRow(cells)) {
      skippedTotalRows += 1;
      continue;
    }
    const limited = cells.slice(0, headers.length);
    while (limited.length < headers.length) limited.push("");
    rows.push(limited.slice(0, headers.length));
  }

  return {
    headers,
    rows,
    preambleRows: indiceCabecalho,
    skippedTotalRows,
  };
}
