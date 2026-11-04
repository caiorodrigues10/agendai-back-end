/**
 * Distribuição de células de uma linha nas colunas por posição horizontal.
 *
 * Promovido do spike (spikes/ocr-benchmark/src/candidates/colunas.ts) — mesma
 * lógica, sem cópia de comportamento do candidato C. Compatível com a saída
 * do OCR (texto + bbox).
 */

export interface CelulaOcr {
  text: string;
  confidence?: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

interface PaginaOcr {
  largura: number;
}

/**
 * Distribui as células da linha nas colunas por posição relativa à largura
 * da página. Retorna { nome, telefone, valor } quando o padrão de tabela
 * (nome/esquerda, telefone/meio, valor/direita) for reconhecido.
 */
export function distribuirColunas(
  celulas: CelulaOcr[],
  largura: number,
): { nome: string[]; telefone: string; valor: string } {
  let nome: string[] = [];
  let telefone = "";
  let valor = "";

  for (const cell of celulas) {
    const x = (cell.bbox.x0 + cell.bbox.x1) / 2 / largura;
    const texto = cell.text.trim();
    if (!texto) continue;
    if (/R\$/i.test(texto) || /^\d[\d.,]*,\d{2}$/.test(texto)) {
      valor = texto;
    } else if (
      /^[\d().\-\s]{8,}$/.test(texto) &&
      /^\d/.test(texto.replace(/[()\s.-]/g, ""))
    ) {
      telefone = texto;
    } else if (x > 0.6) {
      valor = valor || texto;
    } else if (x > 0.35) {
      telefone = telefone || texto;
    } else {
      nome.push(texto);
    }
  }

  return { nome, telefone, valor };
}

/** Agrupa palavras em colunas por coordenada x (atribuição ao centro mais próximo). */
export function clusterColumnsX(
  centrosX: number[],
  maxColunas: number,
): number[] {
  const clusters: number[] = [];
  for (const x of centrosX.sort((a, b) => a - b)) {
    let melhorIdx = -1;
    let melhorDist = Infinity;
    for (let i = 0; i < clusters.length; i += 1) {
      const d = Math.abs(x - clusters[i]);
      if (d < melhorDist) {
        melhorDist = d;
        melhorIdx = i;
      }
    }
    if (melhorIdx >= 0 && melhorDist < 120) {
      clusters[melhorIdx] = (clusters[melhorIdx] + x) / 2;
    } else if (clusters.length < maxColunas) {
      clusters.push(x);
    }
  }
  clusters.sort((a, b) => a - b);
  return clusters;
}
