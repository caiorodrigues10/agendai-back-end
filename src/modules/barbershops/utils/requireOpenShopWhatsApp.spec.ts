import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AppError } from "@/shared/errors/AppError";
import { requireOpenShopWhatsAppInstance } from "./requireOpenShopWhatsApp";

describe("requireOpenShopWhatsAppInstance", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    process.env.EVOLUTION_API_URL = "http://evo.test";
    process.env.EVOLUTION_API_KEY = "key";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.EVOLUTION_API_URL;
    delete process.env.EVOLUTION_API_KEY;
    vi.restoreAllMocks();
  });

  it("409 quando o salão não tem instância", async () => {
    await expect(requireOpenShopWhatsAppInstance({ evolutionInstanceName: null })).rejects.toBeInstanceOf(
      AppError
    );
    await expect(requireOpenShopWhatsAppInstance({ evolutionInstanceName: null })).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("409 quando a Evolution está close", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ instance: { state: "close" } }),
    }) as any;

    await expect(
      requireOpenShopWhatsAppInstance({ evolutionInstanceName: "shop-abc" })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("retorna o nome se a sessão estiver open", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ instance: { state: "open" } }),
    }) as any;

    await expect(
      requireOpenShopWhatsAppInstance({ evolutionInstanceName: "shop-abc" })
    ).resolves.toBe("shop-abc");
  });
});
