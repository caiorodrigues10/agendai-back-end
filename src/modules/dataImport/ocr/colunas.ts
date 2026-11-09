/**
 * Distribuição de células de uma linha nas colunas por posição horizontal.
 *
 * Promovido do spike (spikes/ocr-benchmark/src/candidates/colunas.ts) — mesma
 * lógica, sem cópia de comportamento do candidato C. Compatível com a saída
 * do OCR (texto + bbox).
 *
 * O OCR de importação **não** adivinha o significado das colunas: a
 * distribuição por posição serve para agrupar as palavras em colunas, e quem
 * diz o que cada coluna é o dono, na etapa de mapeamento.
 */

export interface CelulaOcr {
  text: string;
  confidence?: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
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
