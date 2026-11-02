/**
 * Utilidades de OCR compartilhadas: worker do Tesseract e parsing das
 * linhas em colunas (nome / telefone / valor).
 */
import { createWorker, type Worker } from "tesseract.js";

let workerPromise: Promise<Worker> | null = null;

/** Worker único do Tesseract (o startup é caro: ~10 s). */
export function getTesseractWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker("eng", 1, {
      cachePath: `${__dirname}/../.tesseract-cache`,
      logger: () => undefined,
    });
  }
  return workerPromise;
}

/**
 * Encerra o worker. Sem isso o processo Node não sai (o worker segura o
 * event loop) — foi o que travou a primeira execução do runner.
 */
export async function closeTesseractWorker(): Promise<void> {
  if (!workerPromise) return;
  const worker = await workerPromise;
  workerPromise = null;
  await worker.terminate();
}

export interface OcrWord {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

export interface OcrLine {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  words: OcrWord[];
}

/** Roda o Tesseract devolvendo linhas com as palavras posicionadas. */
export async function ocrLines(imagePath: string): Promise<OcrLine[]> {
  const worker = await getTesseractWorker();
  const ret = await worker.recognize(imagePath, {}, { blocks: true, text: true });
  const out: OcrLine[] = [];
  for (const block of ret.data.blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        const words = (line.words ?? []).map((w) => ({
          text: w.text,
          confidence: w.confidence,
          bbox: w.bbox,
        }));
        out.push({
          text: line.text.trim(),
          confidence: line.confidence,
          bbox: line.bbox,
          words,
        });
      }
    }
  }
  return out;
}

/** Números que só podem ser telefone brasileiro (10 ou 11 dígitos). */
export function looksLikePhone(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return digits.length === 10 || digits.length === 11;
}

/** Texto com cara de valor monetário ("R$ 1.234,56", "1.234,56", "250,00"). */
export function looksLikeMoney(value: string): boolean {
  const clean = value.replace(/r\$/gi, "").trim();
  if (!clean) return false;
  if (!/\d/.test(clean)) return false;
  return /[\d.,]/.test(clean) && !/^[A-Za-zÀ-ÿ]+$/.test(clean);
}

/**
 * Quebra uma linha do OCR em (nome, telefone, valor) usando a posição das
 * palavras: telefone é o bloco de dígitos, valor é o token com vírgula/ponto,
 * nome é o resto.
 *
 * Quando o valor veio colado ("R$1.250,75"), separa por token; quando veio
 * com espaço ("R$ 1.250,75"), junta o token monetário com o anterior.
 */
export function splitLine(words: OcrWord[]): { nome?: string; telefone?: string; valor?: string } {
  const tokens = words.map((w) => w.text.trim()).filter(Boolean);
  if (tokens.length === 0) return {};

  const telefoneIdx = tokens.findIndex((t) => looksLikePhone(t));
  const valorIdx = tokens.findIndex(
    (t, i) => i !== telefoneIdx && looksLikeMoney(t) && /\d/.test(t)
  );

  const result: { nome?: string; telefone?: string; valor?: string } = {};

  if (telefoneIdx >= 0) {
    result.telefone = tokens[telefoneIdx];
    const antes = tokens.slice(0, telefoneIdx).filter((t) => !/^r\$/i.test(t));
    result.nome = antes.join(" ").replace(/\s+/g, " ").trim() || undefined;
  } else {
    const antes = tokens.slice(0, valorIdx >= 0 ? valorIdx : tokens.length);
    result.nome = antes.join(" ").replace(/\s+/g, " ").trim() || undefined;
  }

  if (valorIdx >= 0) {
    // "R$ 1.250,75" → token monetário é "1.250,75" (o "R$" veio antes).
    const tokenValor = tokens[valorIdx];
    const anterior = tokens[valorIdx - 1];
    if (anterior && /^r\$/i.test(anterior)) {
      result.valor = `${anterior} ${tokenValor}`;
    } else {
      result.valor = tokenValor;
    }
  }

  return result;
}

/** Remove o cabeçalho (NOME/TELEFONE/VALOR) das linhas. */
export function isHeaderLine(text: string): boolean {
  const t = text.toUpperCase();
  return /NOME/.test(t) && /TELEFONE|FONE|CEL/.test(t);
}
