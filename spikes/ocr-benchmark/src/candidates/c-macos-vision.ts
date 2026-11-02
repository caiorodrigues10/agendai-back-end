/**
 * Candidato C — Vision do macOS (framework nativo, offline).
 *
 * Roda fora do Node (Python + pyobjc) porque o framework Vision só é
 * acessível por Objective-C/Swift. O script recebe o caminho da imagem e
 * devolve as células já agrupadas em linhas visuais (o Vision detecta uma
 * observação por célula).
 *
 * É o candidato "OCR nativo do sistema", sem custo e sem rede — o mais
 * próximo do que um app rodando no dono do salão usaria. **Não é
 * deployável** no backend em Docker/Linux; serve de referência de teto.
 */
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { Candidate, ExtractedRow } from "../types";

const execFileAsync = promisify(execFile);

const SCRIPT = path.resolve(__dirname, "./macos-vision.py");

/** Executável Python que tem o pyobjc. */
function pythonBin(): string {
  const doEnv = process.env.SPICE_PYTHON?.trim();
  if (doEnv) return doEnv;
  // O Python do sistema não tem pyobjc; o venv do spike tem. Ver REPORT.md.
  for (const candidato of ["/tmp/ocrvenv/bin/python3", "/tmp/ocrvenv/bin/python"]) {
    if (fs.existsSync(candidato)) return candidato;
  }
  return "python3";
}

interface VisionCell {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

interface VisionRow {
  texto: string;
  celulas: VisionCell[];
}

/**
 * Distribui as células da linha nas 3 colunas por posição. Usa a posição
 * relativa à largura da página: nome à esquerda, telefone no meio, valor à
 * direita.
 */
function cellsToRow(cells: VisionCell[], largura: number): ExtractedRow {
  let nome: string[] = [];
  let telefone = "";
  let valor = "";

  for (const cell of cells) {
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

export const macosVision: Candidate = {
  id: "C-macos-vision",
  label: "Vision (macOS nativo)",
  description:
    "Framework Vision do macOS (OCR nativo do sistema), offline, via pyobjc. Não deployável no Docker Linux.",
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
        timeout: 60_000,
      });
      const payload = JSON.parse(stdout) as { lines: VisionCell[]; rows: VisionRow[] };

      const todas = payload.lines.flatMap((l) => [l.bbox.x1]);
      const largura = todas.length ? Math.max(...todas) : 1;

      const rows = payload.rows
        .map((r) => cellsToRow(r.celulas, largura))
        .filter((r) => r.nome || r.telefone || r.valor);

      return {
        rows,
        rawText: payload.lines.map((l) => l.text).join("\n"),
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
