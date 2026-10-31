/**
 * Detecção de intenção do atendente de IA.
 *
 * Heurística por palavra-chave — determinística e barata. O texto é
 * normalizado (minúsculas, sem acento) e as palavras curtas são comparadas
 * por token exato: sem isso, "boa noite" casaria com "oi" (dentro de
 * "noite") e "horário" casaria com agendamento e com horário de funcionamento
 * ao mesmo tempo.
 */

export type AiIntent =
  | "scheduling"
  | "reschedule"
  | "pricing"
  | "hours"
  | "location"
  | "human_transfer"
  | "greeting"
  | "farewell"
  | "unknown";

export type AiIntentResult = {
  intent: AiIntent;
  confidence: number;
  entities: Record<string, unknown>;
};

export const AI_INTENTS: AiIntent[] = [
  "scheduling",
  "reschedule",
  "pricing",
  "hours",
  "location",
  "human_transfer",
  "greeting",
  "farewell",
  "unknown",
];

/** Confiança abaixo disso: a IA não tem certeza e passa para um humano. */
export const AI_TRANSFER_CONFIDENCE = 0.5;

const INTENT_KEYWORDS: Record<Exclude<AiIntent, "unknown">, string[]> = {
  scheduling: [
    "agendar",
    "agendamento",
    "agendamentos",
    "marcar",
    "reservar",
    "reserva",
    "disponibilidade",
    "disponivel",
    "vaga",
    "horario livre",
  ],
  reschedule: [
    "cancelar",
    "cancelamento",
    "remarcar",
    "remarcacao",
    "reagendar",
    "reagendamento",
    "mudar horario",
    "adiar",
  ],
  pricing: [
    "preco",
    "precos",
    "valor",
    "valores",
    "quanto custa",
    "quanto e",
    "quanto faz",
    "quanto sai",
    "tabela de precos",
    "quanto pagaria",
  ],
  hours: [
    "horario",
    "horarios",
    "funcionamento",
    "funciona",
    "que horas",
    "abre",
    "fecha",
    "aberto",
    "fechado",
    "abre as",
    "fecha as",
  ],
  location: [
    "endereco",
    "localizacao",
    "onde fica",
    "onde e",
    "como chegar",
    "mapa",
    "rua",
    "avenida",
    "cep",
  ],
  human_transfer: [
    "atendente",
    "pessoa",
    "humano",
    "humana",
    "falar com",
    "suporte",
    "alguem",
    "responsavel",
  ],
  greeting: [
    "oi",
    "ola",
    "bom dia",
    "boa tarde",
    "boa noite",
    "hello",
    "hi",
    "e ai",
    "eai",
    "fala",
    "tudo bem",
    "beleza",
  ],
  farewell: [
    "tchau",
    "ate mais",
    "ate logo",
    "obrigado",
    "obrigada",
    "valeu",
    "falou",
    "bye",
    "goodbye",
  ],
};

/** Remove acento, baixa a caixa e normaliza espaços — "códigos" viram "codigos". */
export function normalizeAiText(text: string | null | undefined): string {
  return (text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Casa a palavra-chave no texto.
 * Frases ("quanto custa") casam por trecho; palavras soltas ("oi") casam
 * por token — é o que evita "boa noite" virar saudação por causa do "oi".
 */
function matchesKeyword(normalized: string, tokens: Set<string>, keyword: string): boolean {
  const normalizedKeyword = normalizeAiText(keyword);
  if (!normalizedKeyword) return false;
  if (normalizedKeyword.includes(" ")) return normalized.includes(normalizedKeyword);
  return tokens.has(normalizedKeyword);
}

/** Detecta a intenção dominante do texto. */
export function detectAiIntent(content: string | null | undefined): AiIntentResult {
  const normalized = normalizeAiText(content);
  const tokens = new Set(normalized.split(" ").filter(Boolean));

  let bestIntent: AiIntent = "unknown";
  let bestConfidence = 0;
  let bestKeywords: string[] = [];

  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    const matched = keywords.filter((keyword) => matchesKeyword(normalized, tokens, keyword));
    if (matched.length === 0) continue;

    const confidence = Math.min(0.5 + matched.length * 0.15, 0.95);
    if (confidence > bestConfidence) {
      bestConfidence = confidence;
      bestIntent = intent as AiIntent;
      bestKeywords = matched;
    }
  }

  if (bestIntent === "unknown") {
    return { intent: "unknown", confidence: 0.3, entities: {} };
  }

  return {
    intent: bestIntent,
    confidence: bestConfidence,
    entities: { matchedKeywords: bestKeywords },
  };
}

/** A mensagem pede para falar com uma pessoa? */
export function isHumanTransferRequest(content: string | null | undefined): boolean {
  return detectAiIntent(content).intent === "human_transfer";
}

/** A IA não tem certeza o bastante para responder sozinha? */
export function shouldEscalate(result: AiIntentResult): boolean {
  return result.intent === "human_transfer" || result.confidence < AI_TRANSFER_CONFIDENCE;
}
