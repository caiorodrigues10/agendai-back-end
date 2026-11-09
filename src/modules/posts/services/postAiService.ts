import { getRedisConnection } from "@/shared/infra/queue/redisConnection";
import { postAudience, type PostBusinessContext } from './postAudience';
import { LEGAL_POST_TEMPLATES, legalDefaultCta } from './legalPostTemplates';
import { POST_TEMPLATES } from './postTemplates';
import { postCategoryForSegment } from './postCategoryCollections';
import { getModuleLogger } from "@/shared/utils/logger";

const logger = getModuleLogger("post-ai");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PostMode = "queue" | "appointments" | "both";
type PostType = "haircut" | "beard" | "announcement";
type Tone = "promocional" | "informativo" | "divertido";

export interface GeneratePostInput extends PostBusinessContext {
  barbershopId: string;
  type: PostType;
  templateKey?: string;
  postMode: PostMode;
  tone?: Tone;
  extra?: string;
  count?: number;
}

export interface PostAiSuggestion {
  title: string;
  ctaText: string;
}

export type GeneratePostOutput =
  | { suggestions: PostAiSuggestion[]; source: "ai"; provider: string }
  | { suggestions: PostAiSuggestion[]; source: "template"; provider: null };

export class DailyLimitExceededError extends Error {
  public readonly code = "AI_DAILY_LIMIT_EXCEEDED" as const;
  public readonly retryAfter: Date;
  constructor(retryAfter: Date) {
    super("Limite diário de gerações IA atingido");
    this.retryAfter = retryAfter;
  }
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const TYPE_LABEL: Record<PostType, string> = {
  haircut: "corte de cabelo",
  beard: "barba",
  announcement: "divulgação / promoção",
};

const MODE_LABEL: Record<PostMode, string> = {
  queue: "Entrar na fila (walk-in)",
  appointments: "Agendar horário",
  both: "Fila ou agenda",
};

const TONE_LABEL: Record<Tone, string> = {
  promocional: "promocional e persuasivo",
  informativo: "informativo e profissional",
  divertido: "descontraído e bem-humorado",
};

function buildPrompt(input: GeneratePostInput): string {
  const profile = postAudience(input);
  const legal = profile.category === "advocacia";
  const tipo = legal ? "conteúdo jurídico informativo ou institucional"
    : profile.category === 'barbearia' || profile.category === 'salao' && input.type === 'haircut' ? TYPE_LABEL[input.type]
    : 'conteúdo informativo do segmento cadastrado';
  const modo = legal ? "Informações e contato" : MODE_LABEL[input.postMode];
  const tom = legal ? "sóbrio, informativo e profissional" : input.tone ? TONE_LABEL[input.tone] : "descontraído e amigável";
  const count = input.count ?? 3;

  let prompt = `Gere ${count} opções de post para Instagram do estabelecimento.

Contexto:
- Segmento cadastrado: ${profile.segment} (${profile.label})
- Público cadastrado: ${profile.audience}. Não deduza gênero por fotos ou pelo segmento.
- Tipo de post: ${tipo}
- Botão de ação deve direcionar para: ${modo}
- Tom da mensagem: ${tom}`;

  if (legal) prompt += "\nPublicidade informativa de advocacia: não inclua preços, descontos, gratuidade, urgência comercial, depoimentos de clientes, promessas de resultado nem dados de processos. Não invente nome, inscrição profissional ou qualificações. Use uma chamada informativa ligada ao assunto, indicando uma ação clara: anotar uma dúvida, confirmar um canal, sugerir uma pauta ou conversar com o escritório. Evite chamadas que sejam apenas rótulos. Nas várias opções, varie o assunto, o ângulo e o próximo passo; não repita apenas conteúdos de preparação de consulta. Personalize somente com localidade, atuação, público e modalidade fornecidos; omita dados ausentes e não substitua por elogios genéricos. Não apresente leis, prazos ou conclusões jurídicas que dependam de verificação não realizada.";
  const template = legal && LEGAL_POST_TEMPLATES.find(item => item[0] === input.templateKey);
  const categoryTemplate = !legal && POST_TEMPLATES.find(item => item.key === input.templateKey && item.businessCategory === profile.category);
  if (categoryTemplate) prompt += `\n- Modelo escolhido: ${categoryTemplate.name}. Finalidade: ${categoryTemplate.description} Varie as opções dentro dessa finalidade; uma mensagem curta por arte.`;
  if (['fisioterapia', 'nutricao', 'psicologia', 'veterinaria'].includes(profile.category)) prompt += '\nNão invente diagnósticos, recomendações de saúde, tratamentos ou resultados clínicos. Use apenas conteúdo institucional e operacional fornecido.';
  if (legal) prompt += '\nArte enxuta: uma única ideia por opção. Prefira título de até seis palavras e chamada de duas a quatro palavras. A chamada deve acrescentar uma ação, sem repetir o título ou a mesma instrução. Deixe explicações extensas para a legenda. Não acrescente frases genéricas para preencher espaço.';
  if (template) prompt += `\n- Modelo escolhido: ${template[1]}. Finalidade: ${template[3]} Varie as opções dentro dessa finalidade. Use apenas dados fornecidos para datas, horários ou identidade.`;
  if (input.extra) {
    const extra = input.extra.replace(/[\u0000-\u001f<>]/g, " ").slice(0, 500).trim();
    if (extra) prompt += `\n- Informação adicional do usuário: ${extra}`;
  }

  prompt += `\nNão invente preços, descontos, resultados, depoimentos, escassez ou serviços. Use linguagem compatível com o segmento e com as informações fornecidas. Títulos curtos serão aplicados na imagem; evite repetições.\n\nPara cada opção, retorne APENAS um JSON com exatamente este formato (sem markdown, sem explicação):
[
  { "title": "título do post (máx 40 caracteres)", "ctaText": "texto do botão de ação (máx 30 caracteres)" }
]

IMPORTANTE: retorne SOMENTE o array JSON, nada mais.`;

  return prompt;
}

// ---------------------------------------------------------------------------
// Response parsing (shared across providers)
// ---------------------------------------------------------------------------

function parseAiResponse(text: string): PostAiSuggestion[] {
  // Try direct parse
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return validateSuggestions(parsed);
  } catch {
    // not raw JSON
  }

  // Try extracting JSON block from markdown
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1].trim());
      if (Array.isArray(parsed)) return validateSuggestions(parsed);
    } catch {
      // failed
    }
  }

  // Try finding array in text
  const arrayMatch = text.match(/\[[\s\S]*?\]/);
  if (arrayMatch) {
    try {
      const parsed = JSON.parse(arrayMatch[0]);
      if (Array.isArray(parsed)) return validateSuggestions(parsed);
    } catch {
      // failed
    }
  }

  return [];
}

function validateSuggestions(arr: unknown[]): PostAiSuggestion[] {
  const seen = new Set<string>();
  return arr
    .filter(
      (s): s is PostAiSuggestion =>
        typeof s === "object" &&
        s !== null &&
        typeof (s as any).title === "string" &&
        typeof (s as any).ctaText === "string"
    )
    .map((s) => ({
      title: s.title.replace(/\s+/g, ' ').trim(),
      ctaText: s.ctaText.replace(/\s+/g, ' ').trim(),
    }))
    .filter((s) => {
      // Reject invalid copy so the provider fallback can supply complete wording.
      // Slicing a sentence can remove a word or reverse the intended message.
      if (!s.title || !s.ctaText || s.title.length > 40 || s.ctaText.length > 30) return false;
      const key = s.title.toLocaleLowerCase('pt-BR');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

// ---------------------------------------------------------------------------
// Quota / rate-limit detection helpers
// ---------------------------------------------------------------------------

function isQuotaError(status: number, body: string): boolean {
  if (status === 429) return true;
  const lower = body.toLowerCase();
  return (
    lower.includes("quota") ||
    lower.includes("rate limit") ||
    lower.includes("too many requests") ||
    lower.includes("resource_exhausted") ||
    lower.includes("insufficient_quota") ||
    lower.includes("billing") ||
    lower.includes("exceeded")
  );
}

function isKeyInvalid(status: number, body: string): boolean {
  if (status === 401 || status === 403) return true;
  const lower = body.toLowerCase();
  return (
    lower.includes("invalid api key") ||
    lower.includes("api_key_invalid") ||
    lower.includes("authentication") ||
    lower.includes("invalid_key")
  );
}

// ---------------------------------------------------------------------------
// Provider: Gemini
// ---------------------------------------------------------------------------

async function callGemini(
  prompt: string,
  count: number
): Promise<{ suggestions: PostAiSuggestion[] } | { error: "quota" | "key" | "other" }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { error: "key" };

  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      signal: AbortSignal.timeout(8_000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.9, maxOutputTokens: 512 },
      }),
    });

    const body = await res.text();

    if (!res.ok) {
      if (isQuotaError(res.status, body)) return { error: "quota" };
      if (isKeyInvalid(res.status, body)) return { error: "key" };
      return { error: "other" };
    }

    const data = JSON.parse(body) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return { error: "other" };

    const suggestions = parseAiResponse(text);
    if (suggestions.length === 0) return { error: "other" };
    return { suggestions };
  } catch {
    return { error: "other" };
  }
}

// ---------------------------------------------------------------------------
// Provider: OpenAI
// ---------------------------------------------------------------------------

async function callOpenAI(
  prompt: string,
  _count: number
): Promise<{ suggestions: PostAiSuggestion[] } | { error: "quota" | "key" | "other" }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { error: "key" };

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(8_000),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.9,
        max_tokens: 512,
      }),
    });

    const body = await res.text();

    if (!res.ok) {
      if (isQuotaError(res.status, body)) return { error: "quota" };
      if (isKeyInvalid(res.status, body)) return { error: "key" };
      return { error: "other" };
    }

    const data = JSON.parse(body) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content;
    if (!text) return { error: "other" };

    const suggestions = parseAiResponse(text);
    if (suggestions.length === 0) return { error: "other" };
    return { suggestions };
  } catch {
    return { error: "other" };
  }
}

// ---------------------------------------------------------------------------
// Provider: Anthropic
// ---------------------------------------------------------------------------

async function callAnthropic(
  prompt: string,
  _count: number
): Promise<{ suggestions: PostAiSuggestion[] } | { error: "quota" | "key" | "other" }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { error: "key" };

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: AbortSignal.timeout(8_000),
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 512,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const body = await res.text();

    if (!res.ok) {
      if (isQuotaError(res.status, body)) return { error: "quota" };
      if (isKeyInvalid(res.status, body)) return { error: "key" };
      return { error: "other" };
    }

    const data = JSON.parse(body) as {
      content?: { type?: string; text?: string }[];
    };
    const text = data.content?.[0]?.text;
    if (!text) return { error: "other" };

    const suggestions = parseAiResponse(text);
    if (suggestions.length === 0) return { error: "other" };
    return { suggestions };
  } catch {
    return { error: "other" };
  }
}

// ---------------------------------------------------------------------------
// Provider: Groq
// ---------------------------------------------------------------------------

async function callGroq(
  prompt: string,
  _count: number
): Promise<{ suggestions: PostAiSuggestion[] } | { error: "quota" | "key" | "other" }> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return { error: "key" };

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(8_000),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.9,
        max_tokens: 512,
      }),
    });

    const body = await res.text();

    if (!res.ok) {
      if (isQuotaError(res.status, body)) return { error: "quota" };
      if (isKeyInvalid(res.status, body)) return { error: "key" };
      return { error: "other" };
    }

    const data = JSON.parse(body) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content;
    if (!text) return { error: "other" };

    const suggestions = parseAiResponse(text);
    if (suggestions.length === 0) return { error: "other" };
    return { suggestions };
  } catch {
    return { error: "other" };
  }
}

// ---------------------------------------------------------------------------
// Provider: Mistral
// ---------------------------------------------------------------------------

async function callMistral(
  prompt: string,
  _count: number
): Promise<{ suggestions: PostAiSuggestion[] } | { error: "quota" | "key" | "other" }> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) return { error: "key" };

  try {
    const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(8_000),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "mistral-small-latest",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.9,
        max_tokens: 512,
      }),
    });

    const body = await res.text();

    if (!res.ok) {
      if (isQuotaError(res.status, body)) return { error: "quota" };
      if (isKeyInvalid(res.status, body)) return { error: "key" };
      return { error: "other" };
    }

    const data = JSON.parse(body) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content;
    if (!text) return { error: "other" };

    const suggestions = parseAiResponse(text);
    if (suggestions.length === 0) return { error: "other" };
    return { suggestions };
  } catch {
    return { error: "other" };
  }
}

// ---------------------------------------------------------------------------
// Provider: DeepSeek
// ---------------------------------------------------------------------------

async function callDeepseek(
  prompt: string,
  _count: number
): Promise<{ suggestions: PostAiSuggestion[] } | { error: "quota" | "key" | "other" }> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return { error: "key" };

  try {
    const res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(8_000),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.9,
        max_tokens: 512,
      }),
    });

    const body = await res.text();

    if (!res.ok) {
      if (isQuotaError(res.status, body)) return { error: "quota" };
      if (isKeyInvalid(res.status, body)) return { error: "key" };
      return { error: "other" };
    }

    const data = JSON.parse(body) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content;
    if (!text) return { error: "other" };

    const suggestions = parseAiResponse(text);
    if (suggestions.length === 0) return { error: "other" };
    return { suggestions };
  } catch {
    return { error: "other" };
  }
}

// ---------------------------------------------------------------------------
// Provider registry
// ---------------------------------------------------------------------------

type ProviderFn = (
  prompt: string,
  count: number
) => Promise<{ suggestions: PostAiSuggestion[] } | { error: "quota" | "key" | "other" }>;

const PROVIDER_MAP: Record<string, ProviderFn> = {
  gemini: callGemini,
  openai: callOpenAI,
  anthropic: callAnthropic,
  groq: callGroq,
  mistral: callMistral,
  deepseek: callDeepseek,
};

const DEFAULT_PROVIDER_ORDER = [
  "gemini",
  "openai",
  "anthropic",
  "groq",
  "mistral",
  "deepseek",
];

function getProviderOrder(): string[] {
  const envOrder = process.env.AI_PROVIDER_ORDER;
  if (envOrder) {
    const parsed = envOrder
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s in PROVIDER_MAP);
    if (parsed.length > 0) return parsed;
  }
  return DEFAULT_PROVIDER_ORDER;
}

// ---------------------------------------------------------------------------
// Daily limit (Redis)
// ---------------------------------------------------------------------------

const DAILY_LIMIT_KEY_PREFIX = "ai:daily-limit:";
const DAILY_LIMIT_TTL_SECONDS = 24 * 60 * 60; // 24h

/** O Redis é auxiliar; indisponibilidade não pode prender a geração. */
async function withRedisDeadline<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Redis indisponível para sugestões de posts")), 500);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function isDailyLimited(barbershopId: string): Promise<Date | null> {
  try {
    const redis = getRedisConnection();
    const key = `${DAILY_LIMIT_KEY_PREFIX}${barbershopId}`;
    const val = await withRedisDeadline(redis.get(key));
    if (!val) return null;
    const blockedAt = new Date(val);
    const retryAfter = new Date(blockedAt.getTime() + DAILY_LIMIT_TTL_SECONDS * 1000);
    return retryAfter;
  } catch {
    return null;
  }
}

async function setDailyLimit(barbershopId: string): Promise<void> {
  try {
    const redis = getRedisConnection();
    const key = `${DAILY_LIMIT_KEY_PREFIX}${barbershopId}`;
    const now = new Date().toISOString();
    await withRedisDeadline(redis.set(key, now, "EX", DAILY_LIMIT_TTL_SECONDS));
  } catch (err) {
    logger.warn({ err, barbershopId }, "Failed to set daily limit in Redis");
  }
}

// ---------------------------------------------------------------------------
// Template fallback (when no keys configured at all)
// ---------------------------------------------------------------------------

const TYPE_DEFAULTS: Record<PostType, PostAiSuggestion[]> = {
  haircut: [
    { title: "Corte sob medida pra você!", ctaText: "Agende agora" },
    { title: "Novo visual, nova vibe", ctaText: "Fila aberta" },
    { title: "Seu corte favorito te espera", ctaText: "Venha hoje" },
  ],
  beard: [
    { title: "Barba feita com critério", ctaText: "Agende a sua" },
    { title: "Barba na régua, estilo no ponto", ctaText: "Fila ou agenda" },
    { title: "O cuidado que você merece", ctaText: "Venha nos visitar" },
  ],
  announcement: [
    { title: "Tem novidade por aqui!", ctaText: "Confira agora" },
    { title: "Promoção imperdível", ctaText: "Aproveite" },
    { title: "Vem cá que tem novidade", ctaText: "Saiba mais" },
  ],
};

function getTemplateSuggestions(input: GeneratePostInput): PostAiSuggestion[] {
  if (input.businessSegment) {
    const profile = postAudience(input);
    const template = profile.category === 'advocacia' && LEGAL_POST_TEMPLATES.find(item => item[0] === input.templateKey);
    if (template) return [{ title: template[2], ctaText: legalDefaultCta(template[0]) }];
    if (profile.category === 'advocacia') return [
      { title: 'Conheça nossas áreas de atuação', ctaText: 'Conheça nossa atuação' },
      { title: 'Contrato em mãos?', ctaText: 'Anote suas dúvidas' },
      { title: 'Contato inesperado?', ctaText: 'Confira o canal oficial' },
      { title: 'Sua dúvida vira pauta', ctaText: 'Sugira um tema' },
      { title: 'Como funciona o atendimento?', ctaText: 'Conheça as etapas' },
    ].slice(0, input.count ?? 3);
    const selected = POST_TEMPLATES.find(template => template.key === input.templateKey && template.businessCategory === profile.category);
    const titles = selected?.sampleTitle ? [selected.sampleTitle] : postCategoryForSegment(input.businessSegment).titles;
    const ctaText = input.postMode === 'queue' ? 'Entrar na fila' : input.postMode === 'both' ? 'Fila ou agenda' : 'Agendar horário';
    return titles.slice(0, input.count ?? 3).map(title => ({ title, ctaText }));
  }
  if (input.tone === "promocional") {
    return [
      { title: "Oferta especial por tempo limitado!", ctaText: "Garanta o seu" },
      { title: "Desconto exclusivo pra você", ctaText: "Aproveite agora" },
      { title: "Não perca essa promoção!", ctaText: "Corre lá" },
    ];
  }
  if (input.tone === "informativo") {
    return [
      { title: "Conheça nossos serviços", ctaText: "Saiba mais" },
      { title: "Horários e disponibilidade", ctaText: "Confira a agenda" },
      { title: "Qualidade que você encontra aqui", ctaText: "Visite-nos" },
    ];
  }
  return TYPE_DEFAULTS[input.type];
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function generatePostContent(
  input: GeneratePostInput
): Promise<GeneratePostOutput> {
  const barbershopId = input.barbershopId;

  // 1. Check daily limit
  const retryAfter = await isDailyLimited(barbershopId);
  if (retryAfter) {
    throw new DailyLimitExceededError(retryAfter);
  }

  const prompt = buildPrompt(input);
  const count = input.count ?? 3;
  const order = getProviderOrder();

  // 2. Check if ANY key is configured
  const hasAnyKey = order.some((name) => {
    const envKey = `${name.toUpperCase()}_API_KEY`;
    if (name === "gemini") return !!process.env.GEMINI_API_KEY;
    return !!process.env[envKey];
  });

  if (!hasAnyKey) {
    logger.info("No AI provider keys configured, using template fallback");
    return { suggestions: getTemplateSuggestions(input), source: "template", provider: null };
  }

  // 3. Try providers in order
  let anyConfigured = false;
  let allConfiguredExhaustedByQuota = true;

  for (const providerName of order) {
    const providerFn = PROVIDER_MAP[providerName];
    if (!providerFn) continue;

    const result = await providerFn(prompt, count);

    if ("suggestions" in result) {
      logger.info({ provider: providerName, barbershopId }, "AI suggestions generated successfully");
      return { suggestions: result.suggestions, source: "ai", provider: providerName };
    }

    if (result.error === "key") {
      logger.debug({ provider: providerName }, "Skipping: no API key configured");
      continue; // not configured, doesn't count
    }

    anyConfigured = true;

    if (result.error === "quota") {
      logger.warn({ provider: providerName, barbershopId }, "Provider quota/rate limit exceeded, trying next");
      continue;
    }

    // erro "other" (chave inválida, 500, parse) em provedor configurado
    logger.warn({ provider: providerName, barbershopId }, "Provider failed with non-quota error");
    allConfiguredExhaustedByQuota = false;
  }

  // 4. All configured providers exhausted
  if (anyConfigured && allConfiguredExhaustedByQuota) {
    await setDailyLimit(barbershopId);
    const limitExpiry = new Date(Date.now() + DAILY_LIMIT_TTL_SECONDS * 1000);
    throw new DailyLimitExceededError(limitExpiry);
  }

  logger.warn({ barbershopId }, "All configured providers exhausted or failed, falling back to templates");
  return { suggestions: getTemplateSuggestions(input), source: "template", provider: null };
}
