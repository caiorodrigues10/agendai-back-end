/**
 * Candidato G — PaddleOCR (CPU, offline apos o download do modelo).
 *
 * Ponte para `src/candidates/paddleocr.py`, que instancia o modelo PaddleOCR
 * UNA VEZ por processo Python e devolve celulas (texto, confianca, bbox)
 * agrupadas em linhas visuais, no mesmo formato do VisionRow/VisionCell do
 * candidato C. A distribuicao em colunas usa o modulo compartilhado
 * `./colunas` (mesma logica do C, sem copiar).
 *
 * Idioma: portugues/latino (lang='pt' => det PP-OCRv6_medium_det +
 * rec PP-OCRv6_medium_rec, que cobre LATIN_LANGS). Modelo carregado uma vez
 * por processo de lote (não por imagem), CPU, sem GPU, sem rede apos o
 * download.
 */
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { Candidate, ExtractedRow } from "../types";
import { distribuirColunas, type Celula } from "./colunas";

const execFileAsync = promisify(execFile);

const SCRIPT = path.resolve(__dirname, "./paddleocr.py");

/** Executável Python com paddlepaddle + paddleocr instalados. */
function pythonBin(): string {
  const doEnv = process.env.PADDLE_PYTHON?.trim();
  if (doEnv) return doEnv;
  const local = path.resolve(__dirname, "../../.venv-paddle/bin/python");
  if (fs.existsSync(local)) return local;
  return "python3";
}

export interface PaddleSaida {
  image: string;
  lines: Array<{ text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }>;
  rows: Array<{ texto: string; celulas: Celula[] }>;
  error?: string;
}

/** Monta as ExtractedRow a partir da saida (ja parseada) do ponte Python.
 *  Nao dispara processo externo: e a unidade testavel do G. */
export function construirRows(
  saida: PaddleSaida[],
  imagePath: string
): { rows: ExtractedRow[]; rawText: string } {
  const entry = saida.find((e) => e.image === imagePath) ?? saida[0];
  if (!entry || entry.error) {
    return { rows: [], rawText: "" };
  }

  const linhas = entry.lines ?? [];
  const todas = linhas.flatMap((l) => [l.bbox.x1]);
  const largura = todas.length ? Math.max(...todas) : 1;

  const rows: ExtractedRow[] = (entry.rows ?? [])
    .map((r) => distribuirColunas(r.celulas, largura))
    .filter((r) => r.nome || r.telefone || r.valor);

  return { rows, rawText: linhas.map((l) => l.text).join("\n") };
}

export const paddleOcr: Candidate = {
  id: "G-paddleocr",
  label: "PaddleOCR (CPU)",
  description:
    "PaddleOCR rodando localmente em CPU (modelo PP-OCRv6 medio, portugues/latino). " +
    "Modelo carregado uma vez por processo Python; offline apos o download. Sem custo por imagem.",
  costPerImageUsd: 0,
  requiresNetwork: false,
  async extract(imagePath) {
    const started = Date.now();
    if (!fs.existsSync(SCRIPT)) {
      return { rows: [], elapsedMs: 0, error: `script ausente: ${SCRIPT}` };
    }
    try {
      const { stdout } = await execFileAsync(pythonBin(), [SCRIPT, imagePath], {
        maxBuffer: 32 * 1024 * 1024,
        timeout: 120_000,
      });
      const saida = JSON.parse(stdout) as PaddleSaida[];
      const { rows, rawText } = construirRows(saida, imagePath);

      return {
        rows,
        rawText,
        elapsedMs: Date.now() - started,
      };
    } catch (err) {
      return {
        rows: [],
        elapsedMs: Date.now() - started,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
