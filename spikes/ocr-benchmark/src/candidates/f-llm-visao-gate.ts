/**
 * Candidato F — LLM visão + gate determinístico.
 *
 * O candidato F é o D (LLM visão) **mais** a camada de validação que a
 * produção já tem: o telefone tem que passar por `normalizePhone` e o valor
 * por `normalizeMoney`. O que não passa é descartado (linha recusada) em vez
 * de entrar errado no CRM.
 *
 * A pergunta que o spike responde com este candidato: "quando o modelo
 * alucina, a validação determinística segura o dado ou só empurra o
 * problema?"
 */
import { normalizeMoney, normalizePhone } from "../../../../src/modules/dataImport/utils/rowNormalization";
import { chat, imageDataUrl, parseJson } from "../llm";
import type { Candidate, ExtractionResult } from "../types";

const MODEL = "nvidia/nemotron-3.5-super-vl-120b-a12b";

const PROMPT = [
  "Você recebe a imagem de uma planilha de clientes.",
  "Extraia TODAS as linhas de dados (ignore o cabeçalho) e devolva APENAS um JSON.",
  'Formato: {"linhas": [{"nome": "...", "telefone": "...", "valor": "..."}]}',
  "Regras:",
  "- nome: como está escrito na imagem;",
  "- telefone: só os dígitos;",
  "- valor: o texto do valor como aparece (ex.: \"1.250,75\");",
  "- se uma linha não tiver algum dado, use string vazia;",
  "- não invente linhas.",
].join("\n");

/** Telefone que passa na normalização de produção. */
function telefoneValido(value: string | undefined): boolean {
  if (!value) return false;
  return normalizePhone(value) !== null;
}

/** Valor que passa na normalização de produção. */
function valorValido(value: string | undefined): boolean {
  if (!value) return false;
  return normalizeMoney(value) !== null;
}

export const llmVisaoComGate: Candidate = {
  id: "F-llm-visao+gate",
  label: "LLM visão + gate determinístico",
  description:
    "Candidato D com a validação de produção: telefone e valor precisam passar por normalizePhone/normalizeMoney; linha inválida é recusada.",
  costPerImageUsd: null,
  requiresNetwork: true,
  async extract(imagePath): Promise<ExtractionResult> {
    const started = Date.now();
    try {
      const dataUrl = await imageDataUrl(imagePath, "image/jpeg");
      const result = await chat({
        model: MODEL,
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
      const brutos = parsed.linhas.map((r) => ({
        nome: typeof r.nome === "string" ? r.nome : undefined,
        telefone: typeof r.telefone === "string" ? r.telefone : undefined,
        valor: typeof r.valor === "string" ? r.valor : undefined,
      }));

      // O gate só recusa quando o dado é **inútil** (não normaliza). Dado que
      // normaliza mas está errado é o caso perigoso — e é medido à parte.
      const rows = brutos.filter(
        (r) => (!r.telefone || telefoneValido(r.telefone)) && (!r.valor || valorValido(r.valor))
      );

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
