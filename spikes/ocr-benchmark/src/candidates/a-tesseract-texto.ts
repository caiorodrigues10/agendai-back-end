/**
 * Candidato A — Tesseract puro (texto → parse por regex/posição).
 *
 * Só texto: sem bounding box. O split das colunas é feito por regex sobre a
 * linha inteira. É a linha de base "clássica" de OCR.
 */
import { ocrLines, splitLine } from "../ocr-utils";
import type { Candidate } from "../types";

export const tesseractTexto: Candidate = {
  id: "A-tesseract-texto",
  label: "Tesseract (texto + regex)",
  description:
    "Tesseract local devolvendo só o texto; colunas separadas por heurística de linha.",
  costPerImageUsd: 0,
  requiresNetwork: false,
  async extract(imagePath) {
    const started = Date.now();
    const lines = await ocrLines(imagePath);
    const rows = lines
      .filter((l) => l.text.length > 0)
      .map((l) => splitLine(l.words))
      .filter((r) => r.nome || r.telefone || r.valor);
    return {
      rows,
      rawText: lines.map((l) => l.text).join("\n"),
      elapsedMs: Date.now() - started,
    };
  },
};
