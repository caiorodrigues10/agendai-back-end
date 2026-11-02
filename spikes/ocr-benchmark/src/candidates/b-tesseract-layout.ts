/**
 * Candidato B — Tesseract com layout (bounding boxes).
 *
 * Usa a posição horizontal das palavras para separar as colunas em vez de
 * regex: as colunas da imagem são detectadas pelo eixo x e as palavras são
 * atribuídas à coluna mais próxima. Cada célula guarda a **menor confiança
 * de palavra** (conservadora) — é isso que a calibração usa para decidir o
 * que vai para revisão.
 */
import { ocrLines, type OcrWord } from "../ocr-utils";
import type { Candidate, ExtractedRow } from "../types";

interface ColWord {
  text: string;
  confidence: number;
  x: number;
}

interface ColGroup {
  x: number;
  words: ColWord[];
}

export interface CelulaOcr {
  linha: number;
  coluna: keyof NonNullable<ExtractedRow["confianca"]>;
  texto: string;
  confianca: number;
}

export interface ResultadoLayout {
  rows: ExtractedRow[];
  rawText: string;
  elapsedMs: number;
  celulas: CelulaOcr[];
}

/** Agrupa as palavras em colunas por x (atribuição ao centro mais próximo). */
function clusterColumns(words: ColWord[], expectedColumns: number): ColGroup[] {
  if (words.length === 0) return [];
  const clusters: ColGroup[] = [];
  const sorted = [...words].sort((a, b) => a.x - b.x);

  for (const word of sorted) {
    let melhor: ColGroup | null = null;
    let melhorDist = Infinity;
    for (const cluster of clusters) {
      const dist = Math.abs(word.x - cluster.x);
      if (dist < melhorDist) {
        melhorDist = dist;
        melhor = cluster;
      }
    }
    if (melhor && melhorDist < 120) {
      melhor.words.push(word);
      melhor.x = melhor.words.reduce((s, w) => s + w.x, 0) / melhor.words.length;
    } else {
      clusters.push({ x: word.x, words: [word] });
    }
  }

  clusters.sort((a, b) => a.x - b.x);
  while (clusters.length > expectedColumns) {
    let menor = 0;
    for (let i = 1; i < clusters.length; i++) {
      if (clusters[i].words.length < clusters[menor].words.length) menor = i;
    }
    clusters.splice(menor, 1);
  }
  return clusters;
}

/** Executa o layout e devolve as células com confiança (usado na calibração). */
export async function extrairComLayout(imagePath: string): Promise<ResultadoLayout> {
  const started = Date.now();
  const lines = await ocrLines(imagePath);

  const todas: ColWord[] = [];
  for (const line of lines) {
    for (const word of line.words) {
      if (!word.text.trim()) continue;
      todas.push({
        text: word.text.trim(),
        confidence: word.confidence,
        x: (word.bbox.x0 + word.bbox.x1) / 2,
      });
    }
  }

  const colunas = clusterColumns(todas, 3);
  const rows: ExtractedRow[] = [];
  const celulas: CelulaOcr[] = [];
  const nomesColuna: Array<keyof NonNullable<ExtractedRow["confianca"]>> = [
    "nome",
    "telefone",
    "valor",
  ];

  for (const line of lines) {
    if (!line.text.trim()) continue;
    const textoLinha = line.text.toUpperCase();
    if (/NOME/.test(textoLinha) && /TELEFONE|FONE|CEL/.test(textoLinha)) continue;

    const porColuna: Array<{ textos: string[]; confiancas: number[] }> = colunas.map(() => ({
      textos: [],
      confiancas: [],
    }));

    for (const word of line.words) {
      if (!word.text.trim()) continue;
      const x = (word.bbox.x0 + word.bbox.x1) / 2;
      let idx = 0;
      let dist = Infinity;
      for (let i = 0; i < colunas.length; i++) {
        const d = Math.abs(x - colunas[i].x);
        if (d < dist) {
          dist = d;
          idx = i;
        }
      }
      porColuna[idx].textos.push(word.text.trim());
      porColuna[idx].confiancas.push(word.confidence);
    }

    const valores = porColuna.map((c) => ({
      texto: c.textos.join(" ").replace(/\s+/g, " ").trim(),
      confianca: c.confiancas.length ? Math.min(...c.confiancas) : 0,
    }));

    const nome = valores[0]?.texto;
    const telefone = valores[1]?.texto;
    const valor = valores[2]?.texto;
    if (!nome && !telefone && !valor) continue;

    const linhaIndex = rows.length;
    rows.push({
      nome,
      telefone,
      valor,
      confianca: {
        nome: valores[0]?.confianca,
        telefone: valores[1]?.confianca,
        valor: valores[2]?.confianca,
      },
    });
    for (let i = 0; i < nomesColuna.length; i++) {
      celulas.push({
        linha: linhaIndex,
        coluna: nomesColuna[i],
        texto: valores[i]?.texto ?? "",
        confianca: valores[i]?.confianca ?? 0,
      });
    }
  }

  return {
    rows,
    rawText: lines.map((l) => l.text).join("\n"),
    elapsedMs: Date.now() - started,
    celulas,
  };
}

export const tesseractLayout: Candidate = {
  id: "B-tesseract-layout",
  label: "Tesseract (layout por bounding box)",
  description:
    "Tesseract local com posição das palavras; colunas agrupadas por coordenada x. Confiança por célula disponível.",
  costPerImageUsd: 0,
  requiresNetwork: false,
  async extract(imagePath) {
    const r = await extrairComLayout(imagePath);
    return { rows: r.rows, rawText: r.rawText, elapsedMs: r.elapsedMs };
  },
};

// Mantém o tipo de palavra exportado para quem quiser inspecionar o OCR.
export type { OcrWord };
