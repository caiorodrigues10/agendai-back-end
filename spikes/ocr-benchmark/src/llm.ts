/**
 * Cliente da API OpenAI-compatível (NVIDIA NIM) usado pelos candidatos que
 * dependem de rede.
 *
 * A chave e a URL vêm do ambiente (OPENAI_BASE_URL / OPENAI_API_KEY). O
 * spike não carrega nem grava segredo em arquivo.
 */
export interface ChatMessageContent {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string };
}

export interface ChatResult {
  content: string;
  elapsedMs: number;
  promptTokens?: number;
  completionTokens?: number;
  /** Motivo de parada informado pelo provedor (stop/length/etc.). */
  finishReason?: string;
  /** Quantas tentativas foram necessárias (1 = sem retry). */
  attempts: number;
}

export interface ChatOptions {
  model: string;
  messages: Array<{ role: "user" | "system"; content: string | ChatMessageContent[] }>;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

function baseUrl(): string {
  const raw = process.env.OPENAI_BASE_URL?.trim() || "https://integrate.api.nvidia.com/v1";
  return raw.replace(/\/+$/, "");
}

function apiKey(): string {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("OPENAI_API_KEY ausente — os candidatos de rede não podem rodar.");
  return key;
}

export async function chat(options: ChatOptions): Promise<ChatResult> {
  const started = Date.now();
  const maxTentativas = 3;
  let ultimoErro: Error | null = null;

  for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 90_000);
    try {
      const res = await fetch(`${baseUrl()}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: options.model,
          messages: options.messages,
          max_tokens: options.maxTokens ?? 1200,
          temperature: options.temperature ?? 0,
        }),
        signal: controller.signal,
      });
      const body = (await res.json()) as {
        choices?: Array<{ message?: { content?: string | null }; finish_reason?: string }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
        error?: unknown;
      };
      if (!res.ok) {
        ultimoErro = new Error(`HTTP ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
        // 429/5xx e resposta vazia valem retry; 4xx de entrada não.
        if (res.status === 429 || res.status >= 500) {
          await espera(tentativa);
          continue;
        }
        throw ultimoErro;
      }
      const raw = body.choices?.[0]?.message?.content ?? "";
      const content = typeof raw === "string" ? raw : "";
      if (!content.trim()) {
        // O NIM às vezes devolve 200 com conteúdo vazio sob concorrência.
        ultimoErro = new Error("resposta vazia do provedor");
        await espera(tentativa);
        continue;
      }
      return {
        content,
        elapsedMs: Date.now() - started,
        promptTokens: body.usage?.prompt_tokens,
        completionTokens: body.usage?.completion_tokens,
        finishReason: body.choices?.[0]?.finish_reason,
        attempts: tentativa,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  throw ultimoErro ?? new Error("falha desconhecida na chamada do provedor");
}

function espera(tentativa: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 500 * tentativa));
}

/** Converte um arquivo em data URL para mandar como imagem. */
export async function imageDataUrl(imagePath: string, mime: string): Promise<string> {
  const fs = await import("node:fs");
  const buffer = fs.readFileSync(imagePath);
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

/**
 * Extrai JSON de uma resposta de LLM: aceita JSON puro ou JSON dentro de
 * bloco de código, e devolve null quando não há JSON válido.
 */
export function parseJson<T>(text: string): T | null {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  try {
    return JSON.parse(candidate) as T;
  } catch {
    const start = candidate.search(/[[{]/);
    if (start < 0) return null;
    const open = candidate[start];
    const close = open === "[" ? "]" : "}";
    const end = candidate.lastIndexOf(close);
    if (end <= start) return null;
    try {
      return JSON.parse(candidate.slice(start, end + 1)) as T;
    } catch {
      return null;
    }
  }
}
