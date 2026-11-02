/**
 * Candidato E — OCR local + LLM só para estruturar.
 *
 * Duas etapas: o Tesseract (barato, offline) transcreve; o LLM recebe
 * **só o texto** (sem imagem) e devolve as linhas em JSON. A imagem nunca
 * sai do servidor.
 *
 * Modelo: nvidia/nemotron-3.5-super-vl-120b-a12b (aceita texto puro também).
 */
import { chat, parseJson } from "../llm";
import { ocrLines } from "../ocr-utils";
import { MODELO_VL } from "./d-llm-visao";
import type { Candidate } from "../types";

const PROMPT = [
  "Abaixo está o texto OCR (pode ter erros de reconhecimento) de uma planilha de clientes.",
  "Reconstrua as linhas da tabela e devolva APENAS um JSON.",
  'Formato: {"linhas": [{"nome": "...", "telefone": "...", "valor": "..."}]}',
  "Regras:",
  "- telefone: só dígitos;",
  "- valor: como aparece no texto;",
  "- ignore a linha de cabeçalho;",
  "- não invente nem complete dados que não estão no texto.",
].join("\n");

export const ocrMaisLlm: Candidate = {
  id: "E-ocr+llm",
  label: "OCR local + LLM estrutura",
  description:
    "Tesseract transcreve offline; LLM recebe só o texto e devolve JSON (imagem não sai do servidor).",
  costPerImageUsd: null,
  requiresNetwork: true,
  async extract(imagePath) {
    const started = Date.now();
    try {
      const lines = await ocrLines(imagePath);
      const texto = lines.map((l) => l.text).join("\n");
      const result = await chat({
        model: MODELO_VL,
        messages: [{ role: "user", content: `${PROMPT}\n\nTEXTO OCR:\n${texto}` }],
        maxTokens: 2000,
        temperature: 0,
      });
      const parsed = parseJson<{ linhas?: Array<Record<string, unknown>> }>(result.content);
      if (!parsed || !Array.isArray(parsed.linhas)) {
        throw new Error("resposta sem JSON utilizavel: " + result.content.slice(0, 200));
      }
      const rows = parsed.linhas.map((r) => ({
        nome: typeof r.nome === "string" ? r.nome : undefined,
        telefone: typeof r.telefone === "string" ? r.telefone : undefined,
        valor: typeof r.valor === "string" ? r.valor : undefined,
      }));
      return {
        rows,
        rawText: result.content,
        elapsedMs: Date.now() - started,
        attempts: result.attempts,
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
