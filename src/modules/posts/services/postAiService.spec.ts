/// <reference types="vitest/globals" />
import { POST_CATEGORY_COLLECTIONS } from './postCategoryCollections';

// Mock Redis before importing the service
const mockRedisGet = vi.fn();
const mockRedisSet = vi.fn();
vi.mock("@/shared/infra/queue/redisConnection", () => ({
  getRedisConnection: () => ({
    get: mockRedisGet,
    set: mockRedisSet,
  }),
}));

// Mock logger to silence output
vi.mock("@/shared/utils/logger", () => ({
  getModuleLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import {
  generatePostContent,
  DailyLimitExceededError,
  type GeneratePostInput,
} from "./postAiService";

const baseInput: GeneratePostInput = {
  barbershopId: "00000000-0000-0000-0000-000000000001",
  type: "haircut",
  postMode: "both",
  tone: "promocional",
  count: 3,
};

// Helper: mock fetch to return a given status + body
function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

function mockFetchText(status: number, text: string) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(text),
  });
}

describe("postAiService", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    mockRedisGet.mockResolvedValue(null);
    mockRedisSet.mockResolvedValue("OK");
    // Clear all provider keys
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GROQ_API_KEY;
    delete process.env.MISTRAL_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.AI_PROVIDER_ORDER;
    process.env.VITEST = "true";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe("dependency timeouts", () => {
    it.each(POST_CATEGORY_COLLECTIONS.filter(collection => collection.category !== 'advocacia'))('usa os temas de $segment no fallback', async collection => {
      const result = await generatePostContent({ ...baseInput, businessSegment: collection.segment, count: 3 });
      expect(result.source).toBe('template');
      expect(result.suggestions.map(item => item.title)).toEqual(collection.titles.slice(0, 3));
      expect(result.suggestions.every(item => item.title.length <= 40)).toBe(true);
      const selected = await generatePostContent({ ...baseInput, businessSegment: collection.segment, templateKey: `${collection.category}-colecao-10`, count: 3 });
      expect(selected.suggestions).toEqual([expect.objectContaining({ title: collection.titles[9] })]);
    });
    it('usa o segmento no fallback sem inventar descontos nem serviços de barba para salão', async () => {
      const result = await generatePostContent({ ...baseInput, businessSegment: 'HAIR_SALON', targetAudience: 'UNISSEX' });
      expect(result.source).toBe('template');
      expect(result.suggestions[0].title).toBe('Conheça o salão');
      expect(JSON.stringify(result)).not.toMatch(/desconto|barba|promoção/i);
    });
    it('envia segmento e público reais ao provedor', async () => {
      process.env.GEMINI_API_KEY = 'test-placeholder';
      const fetchMock = mockFetch(200, { candidates: [{ content: { parts: [{ text: JSON.stringify([{ title: 'Cuide de você', ctaText: 'Agendar' }]) }] } }] });
      vi.stubGlobal('fetch', fetchMock);
      await generatePostContent({ ...baseInput, businessSegment: 'NAIL_STUDIO', targetAudience: 'UNISSEX' });
      const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
      expect(body.contents[0].parts[0].text).toContain('NAIL_STUDIO');
      expect(body.contents[0].parts[0].text).toContain('UNISSEX');
    });
    it("returns suggestions even when Redis never answers", async () => {
      mockRedisGet.mockReturnValue(new Promise(() => undefined));
      const result = await generatePostContent(baseInput);
      expect(result.source).toBe("template");
      expect(result.suggestions).toHaveLength(3);
    });

    it("falls back after a provider aborts and sends an abort signal", async () => {
      process.env.GEMINI_API_KEY = "test-key";
      const abort = new AbortController();
      const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(abort.signal);
      vi.stubGlobal("fetch", vi.fn().mockImplementation((_url, options) => new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => reject(new Error("timeout")), { once: true });
      })));
      const generation = generatePostContent(baseInput);
      await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
      expect(timeout).toHaveBeenCalledWith(8_000);
      abort.abort();
      const result = await generation;
      expect(result.source).toBe("template");
      expect(result.suggestions.length).toBeGreaterThan(0);
    });
  });

  describe("template fallback (no keys configured)", () => {
    it("returns template suggestions when no provider keys are set", async () => {
      const result = await generatePostContent(baseInput);
      expect(result.source).toBe("template");
      expect(result.provider).toBeNull();
      expect(result.suggestions).toHaveLength(3);
      expect(result.suggestions[0].title).toBeTruthy();
      expect(result.suggestions[0].ctaText).toBeTruthy();
    });

    it("returns tone-specific templates for promocional", async () => {
      const result = await generatePostContent({
        ...baseInput,
        tone: "promocional",
      });
      expect(result.source).toBe("template");
      expect(result.suggestions.some((s) => s.title.includes("Oferta"))).toBe(true);
    });

    it("returns tone-specific templates for informativo", async () => {
      const result = await generatePostContent({
        ...baseInput,
        tone: "informativo",
      });
      expect(result.source).toBe("template");
      expect(result.suggestions.some((s) => s.title.includes("Conheça"))).toBe(true);
    });

    it("returns type-specific defaults when no tone", async () => {
      const result = await generatePostContent({
        ...baseInput,
        tone: undefined,
      });
      expect(result.source).toBe("template");
      expect(result.suggestions.some((s) => s.title.includes("Corte sob medida"))).toBe(true);
    });
  });

  describe("provider fallback chain", () => {
    it("falls back to OpenAI when Gemini returns 429", async () => {
      process.env.GEMINI_API_KEY = "test-gemini-key";
      process.env.OPENAI_API_KEY = "test-openai-key";
      process.env.AI_PROVIDER_ORDER = "gemini,openai";

      const geminiResponse = [
        { title: "Post sugerido", ctaText: "Clique aqui" },
      ];

      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        callCount++;
        if (callCount === 1) {
          // Gemini: 429
          return { ok: false, status: 429, text: () => Promise.resolve('{"error": {"message": "quota exceeded"}}') };
        }
        // OpenAI: success
        return {
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify({
            choices: [{ message: { content: JSON.stringify(geminiResponse) } }],
          })),
        };
      }) as any;

      const result = await generatePostContent(baseInput);
      expect(result.source).toBe("ai");
      expect(result.provider).toBe("openai");
      expect(result.suggestions).toEqual(geminiResponse);
    });

    it("skips providers without API keys silently", async () => {
      process.env.GEMINI_API_KEY = "";
      process.env.OPENAI_API_KEY = "test-openai-key";
      process.env.AI_PROVIDER_ORDER = "gemini,openai";

      const aiResponse = [{ title: "AI post", ctaText: "Venha" }];
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({
          choices: [{ message: { content: JSON.stringify(aiResponse) } }],
        })),
      }) as any;

      const result = await generatePostContent(baseInput);
      expect(result.source).toBe("ai");
      expect(result.provider).toBe("openai");
      // fetch should only be called once (for openai, gemini skipped)
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it("tries all providers when each returns 429", async () => {
      process.env.GEMINI_API_KEY = "key1";
      process.env.OPENAI_API_KEY = "key2";
      process.env.AI_PROVIDER_ORDER = "gemini,openai";

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: () => Promise.resolve('{"error": {"message": "rate limited"}}'),
      }) as any;

      await expect(generatePostContent(baseInput)).rejects.toThrow(DailyLimitExceededError);
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });

    it("dispara limite diário com apenas 1 provedor configurado no chain padrão (6 provedores)", async () => {
      process.env.GEMINI_API_KEY = "key1";
      // não define AI_PROVIDER_ORDER -> usa a ordem default de 6 provedores, só gemini tem chave

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: () => Promise.resolve('{"error":{"message":"quota exceeded"}}'),
      }) as any;

      await expect(generatePostContent(baseInput)).rejects.toThrow(DailyLimitExceededError);
    });
  });

  describe("DailyLimitExceededError", () => {
    it("throws when daily limit key exists in Redis", async () => {
      process.env.GEMINI_API_KEY = "key1";
      const retryAfter = new Date(Date.now() + 3600_000).toISOString();
      mockRedisGet.mockResolvedValue(retryAfter);

      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy;

      await expect(generatePostContent(baseInput)).rejects.toThrow(DailyLimitExceededError);
      // Should NOT call any API
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("sets daily limit in Redis when all providers fail with quota", async () => {
      process.env.GEMINI_API_KEY = "key1";
      process.env.AI_PROVIDER_ORDER = "gemini";

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: () => Promise.resolve('{"error": {"message": "quota exceeded"}}'),
      }) as any;

      try {
        await generatePostContent(baseInput);
      } catch {
        // expected
      }

      expect(mockRedisSet).toHaveBeenCalledWith(
        "ai:daily-limit:00000000-0000-0000-0000-000000000001",
        expect.any(String),
        "EX",
        86400
      );
    });

    it("includes retryAfter date in the error", async () => {
      process.env.GEMINI_API_KEY = "key1";
      const retryAfter = new Date(Date.now() + 3600_000).toISOString();
      mockRedisGet.mockResolvedValue(retryAfter);

      try {
        await generatePostContent(baseInput);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(DailyLimitExceededError);
        expect((err as DailyLimitExceededError).retryAfter).toBeInstanceOf(Date);
        expect((err as DailyLimitExceededError).code).toBe("AI_DAILY_LIMIT_EXCEEDED");
      }
    });
  });

  describe("AI success", () => {
    it("returns suggestions from first available provider", async () => {
      process.env.GEMINI_API_KEY = "test-key";
      process.env.AI_PROVIDER_ORDER = "gemini";

      const aiSuggestions = [
        { title: "Corte top!", ctaText: "Agende já" },
        { title: "Seu novo visual", ctaText: "Venha hoje" },
        { title: "Promoção de corte", ctaText: "Aproveite" },
      ];

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({
          candidates: [{ content: { parts: [{ text: JSON.stringify(aiSuggestions) } ] } }],
        })),
      }) as any;

      const result = await generatePostContent(baseInput);
      expect(result.source).toBe("ai");
      expect(result.provider).toBe("gemini");
      expect(result.suggestions).toHaveLength(3);
    });

    it("handles markdown-wrapped JSON responses", async () => {
      process.env.GEMINI_API_KEY = "test-key";
      process.env.AI_PROVIDER_ORDER = "gemini";

      const suggestions = [{ title: "Teste", ctaText: "Botão" }];
      const markdownResponse = "Aqui estão as sugestões:\n```json\n" + JSON.stringify(suggestions) + "\n```\nEspero que ajude!";

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({
          candidates: [{ content: { parts: [{ text: markdownResponse } ] } }],
        })),
      }) as any;

      const result = await generatePostContent(baseInput);
      expect(result.source).toBe("ai");
      expect(result.suggestions).toEqual(suggestions);
    });

    it("usa sugestões completas de fallback quando o provedor excede os limites", async () => {
      process.env.GEMINI_API_KEY = "test-key";
      process.env.AI_PROVIDER_ORDER = "gemini";

      const longSuggestions = [
        {
          title: "A".repeat(100),
          ctaText: "B".repeat(100),
        },
      ];

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({
          candidates: [{ content: { parts: [{ text: JSON.stringify(longSuggestions) } ] } }],
        })),
      }) as any;

      const result = await generatePostContent(baseInput);
      expect(result.source).toBe('template');
      expect(result.suggestions[0].title).not.toContain('A'.repeat(40));
      expect(result.suggestions[0].title.length).toBeLessThanOrEqual(40);
      expect(result.suggestions[0].ctaText.length).toBeLessThanOrEqual(30);
    });

    it('descarta textos vazios e sugestões repetidas, preservando as palavras recebidas', async () => {
      process.env.GEMINI_API_KEY = 'test-key';
      process.env.AI_PROVIDER_ORDER = 'gemini';
      const suggestions = [
        { title: '   ', ctaText: 'Contato' },
        { title: 'Título sem chamada', ctaText: '\n ' },
        { title: '  Contrato em mãos?  ', ctaText: ' Anote suas dúvidas ' },
        { title: 'contrato em mãos?', ctaText: 'Outro CTA' },
        { title: 'Contato inesperado?', ctaText: 'Confira o canal oficial' },
      ];
      vi.stubGlobal('fetch', mockFetch(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(suggestions) }] } }] }));
      const result = await generatePostContent(baseInput);
      expect(result.source).toBe('ai');
      expect(result.suggestions).toEqual([
        { title: 'Contrato em mãos?', ctaText: 'Anote suas dúvidas' },
        { title: 'Contato inesperado?', ctaText: 'Confira o canal oficial' },
      ]);
    });

    it('oferece cinco alternativas jurídicas distintas com chamadas ligadas ao assunto no fallback', async () => {
      const result = await generatePostContent({ ...baseInput, businessSegment: 'LAW_FIRM', count: 5 });
      expect(result.source).toBe('template');
      expect(result.suggestions).toHaveLength(5);
      expect(new Set(result.suggestions.map(s => s.title)).size).toBe(5);
      expect(new Set(result.suggestions.map(s => s.ctaText)).size).toBe(5);
      expect(JSON.stringify(result)).not.toMatch(/desconto|gratuidade|garantid|Informações e contato/i);
    });

    it('considera a finalidade do modelo escolhido no prompt e preserva o contexto extra', async () => {
      process.env.GEMINI_API_KEY = 'test-key';
      process.env.AI_PROVIDER_ORDER = 'gemini';
      vi.stubGlobal('fetch', mockFetch(200, { candidates: [{ content: { parts: [{ text: JSON.stringify([{ title: 'Horário especial', ctaText: 'Confirme seu horário' }]) }] } }] }));
      const extra = 'A'.repeat(500);
      await generatePostContent({ ...baseInput, businessSegment: 'LAW_FIRM', templateKey: 'advocacia-comunicado', extra });
      const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
      const prompt = body.contents[0].parts[0].text;
      expect(prompt).toContain('Modelo escolhido: Aviso com data');
      expect(prompt).toContain('Data e horário informados');
      expect(prompt).toContain(extra);
    });

    it('mantém o fallback na finalidade selecionada, sem inventar dados do aviso', async () => {
      const result = await generatePostContent({ ...baseInput, businessSegment: 'LAW_FIRM', templateKey: 'advocacia-comunicado' });
      expect(result).toMatchObject({ source: 'template', suggestions: [{ title: 'Horário especial', ctaText: 'Confira a agenda' }] });
      expect(JSON.stringify(result)).not.toMatch(/\b23\b|NOV|13h|18h/);
    });
  });

  describe("provider order from env", () => {
    it("respects AI_PROVIDER_ORDER env var", async () => {
      process.env.GROQ_API_KEY = "groq-key";
      process.env.AI_PROVIDER_ORDER = "groq";

      const suggestions = [{ title: "Groq post", ctaText: "Vem" }];

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({
          choices: [{ message: { content: JSON.stringify(suggestions) } }],
        })),
      }) as any;

      const result = await generatePostContent(baseInput);
      expect(result.provider).toBe("groq");
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("non-quota errors", () => {
    it("does not set daily limit when error is not quota-related", async () => {
      process.env.GEMINI_API_KEY = "key1";
      process.env.AI_PROVIDER_ORDER = "gemini";

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('{"error": {"message": "internal server error"}}'),
      }) as any;

      const result = await generatePostContent(baseInput);
      // Should fall back to templates, not throw
      expect(result.source).toBe("template");
      expect(mockRedisSet).not.toHaveBeenCalled();
    });
  });
  it('usa linguagem jurídica neutra no fallback mesmo quando o tipo legado é haircut e o tom é promocional', async () => {
    const result = await generatePostContent({ ...baseInput, businessSegment: 'LAW_FIRM', targetAudience: 'UNISSEX' });
    expect(result.source).toBe('template');
    expect(result.suggestions).toHaveLength(3);
    for (const suggestion of result.suggestions) {
      expect(suggestion.ctaText.trim()).toBeTruthy();
      expect(suggestion.ctaText).not.toMatch(/promoção|desconto|garantido|Informações e contato/i);
      expect(suggestion.title).not.toMatch(/corte|barba|promoção|desconto|garantido/i);
    }
  });

});
