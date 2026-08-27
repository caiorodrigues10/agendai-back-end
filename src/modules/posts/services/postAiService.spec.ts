import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

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

    it("truncates long titles and CTA texts", async () => {
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
      expect(result.suggestions[0].title.length).toBeLessThanOrEqual(40);
      expect(result.suggestions[0].ctaText.length).toBeLessThanOrEqual(30);
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
});
