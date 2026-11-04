/**
 * Distribuicao de celulas de uma linha nas 3 colunas da tabela (nome, telefone,
 * valor) por posicao horizontal relativa à largura da pagina.
 *
 * Extraido do candidato C (macos-vision.py / c-macos-vision.ts) para ser
 * reusado pelo candidato G (PaddleOCR) sem copiar a logica. O comportamento
 * e identico ao que o C tinha: mesmo regex, mesmos limiares (0.35 / 0.6),
 * mesma precedencia.
 *
 * Celula: { text, bbox: {x0, y0, x1, y1} } — compatível com VisionCell do C
 * e com a saida da ponte paddleocr.py.
 */

import type { ExtractedRow } from "../types";

export interface Celula {
  text: string;
  confidence?: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

/** Largura da pagina usada como referencia para classificar as colunas. */
export interface Pagina {
  largura: number;
}

/**
 * Distribui as celulas da linha nas 3 colunas por posicao relativa: nome à
 * esquerda, telefone no meio, valor à direita.
 */
export function distribuirColunas(celulas: Celula[], largura: number): ExtractedRow {
  let nome: string[] = [];
  let telefone = "";
  let valor = "";

  for (const cell of celulas) {
    const x = (cell.bbox.x0 + cell.bbox.x1) / 2 / largura;
    const texto = cell.text.trim();
    if (!texto) continue;
    if (/R\$/i.test(texto) || /^\d[\d.,]*,\d{2}$/.test(texto)) {
      valor = texto;
    } else if (/^[\d().\-\s]{8,}$/.test(texto) && /^\d/.test(texto.replace(/[()\s.-]/g, ""))) {
      telefone = texto;
    } else if (x > 0.6) {
      valor = valor || texto;
    } else if (x > 0.35) {
      telefone = telefone || texto;
    } else {
      nome.push(texto);
    }
  }

  return {
    nome: nome.join(" ").replace(/\s+/g, " ").trim() || undefined,
    telefone: telefone || undefined,
    valor: valor || undefined,
  };
}
