/**
 * Candidato D — LLM com visão (tabela inteira como imagem).
 *
 * Manda a imagem da planilha para um modelo multimodal e pede JSON
 * estruturado. É a abordagem "delegar tudo ao modelo": o modelo lê a
 * imagem, entende o layout e devolve as linhas já tipadas.
 *
 * Modelo: nvidia/nemotron-3.5-super-vl-120b-a12b (NVIDIA NIM, endpoint
 * OpenAI-compatível configurado no ambiente).
 */
import { chat, imageDataUrl, parseJson } from "../llm";
import type { Candidate } from "../types";

export const MODELO_VL = "nvidia/nemotron-3.5-super-vl-120b-a12b";

const PROMPT = [
  "Você recebe a imagem de uma planilha de clientes.",
  "Extraia TODAS as linhas de dados (ignore o cabeçalho) e devolva APENAS um JSON.",
  'Formato: {"linhas": [{"nome": "...", "telefone": "...", "valor": "..."}]}',
  "Regras:",
  "- nome: como está escrito na imagem;",
  "- telefone: só os dígitos, exatamente como aparecem na imagem;",
  "- valor: o texto do valor como aparece na imagem (ex.: \"1.250,75\");",
  "- se uma linha não tiver algum dado, use string vazia;",
  "- não invente linhas, não corrija o que está na imagem.",
].join("\n");

export const llmVisao: Candidate = {
  id: "D-llm-visao",
  label: "LLM visão (nemotron VL)",
  description:
    "Modelo multimodal lê a imagem inteira e devolve JSON estruturado (1 chamada por imagem).",
  costPerImageUsd: null,
  requiresNetwork: true,
  async extract(imagePath) {
    const started = Date.now();
    try {
      const dataUrl = await imageDataUrl(imagePath, "image/jpeg");
      const result = await chat({
        model: MODELO_VL,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: PROMPT },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
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
