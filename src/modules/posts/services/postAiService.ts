type PostMode = "queue" | "appointments" | "both";
type PostType = "haircut" | "beard" | "announcement";
type Tone = "promocional" | "informativo" | "divertido";

export interface GeneratePostInput {
  barbershopId: string;
  type: PostType;
  postMode: PostMode;
  tone?: Tone;
  extra?: string;
  count?: number;
}

export interface PostAiSuggestion {
  title: string;
  ctaText: string;
}

type GeneratePostOutput = {
  suggestions: PostAiSuggestion[];
  source: "ai" | "template";
};

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

function buildGeminiPrompt(input: GeneratePostInput): string {
  const tipo = TYPE_LABEL[input.type];
  const modo = MODE_LABEL[input.postMode];
  const tom = input.tone ? TONE_LABEL[input.tone] : "descontraído e amigável";
  const count = input.count ?? 3;

  let prompt = `Gere ${count} opções de post para Instagram de barbearia/salão.

Contexto:
- Tipo de post: ${tipo}
- CTA deve direcionar para: ${modo}
- Tom da mensagem: ${tom}`;

  if (input.extra) {
    prompt += `\n- Informação adicional do usuário: ${input.extra}`;
  }

  prompt += `\n\nPara cada opção, retorne APENAS um JSON com exatamente este formato (sem markdown, sem explicação):
[
  { "title": "título do post (máx 40 caracteres)", "ctaText": "texto do botão CTA (máx 30 caracteres)" }
]

IMPORTANTE: retorne SOMENTE o array JSON, nada mais.`;

  return prompt;
}

function parseGeminiResponse(text: string): PostAiSuggestion[] {
  const cleaned = text.replace(/```json\n?|\n?```/g, "").trim();
  const parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter(
      (s): s is PostAiSuggestion =>
        typeof s === "object" &&
        s !== null &&
        typeof s.title === "string" &&
        typeof s.ctaText === "string"
    )
    .map((s) => ({
      title: s.title.slice(0, 40),
      ctaText: s.ctaText.slice(0, 30),
    }));
}

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
  const defaults = TYPE_DEFAULTS[input.type];

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

  return defaults;
}

export async function generatePostContent(
  input: GeneratePostInput
): Promise<GeneratePostOutput> {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";

  if (!apiKey) {
    return {
      suggestions: getTemplateSuggestions(input),
      source: "template",
    };
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const prompt = buildGeminiPrompt(input);

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.9,
          maxOutputTokens: 512,
        },
      }),
    });

    if (!res.ok) {
      console.error("[postAiService] Gemini API error:", res.status);
      return {
        suggestions: getTemplateSuggestions(input),
        source: "template",
      };
    }

    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      return {
        suggestions: getTemplateSuggestions(input),
        source: "template",
      };
    }

    const suggestions = parseGeminiResponse(text);
    if (suggestions.length === 0) {
      return {
        suggestions: getTemplateSuggestions(input),
        source: "template",
      };
    }

    return { suggestions, source: "ai" };
  } catch (err) {
    console.error("[postAiService] Error calling Gemini:", err);
    return {
      suggestions: getTemplateSuggestions(input),
      source: "template",
    };
  }
}
