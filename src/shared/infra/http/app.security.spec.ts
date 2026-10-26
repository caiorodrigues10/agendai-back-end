/// <reference types="vitest/globals" />
import type { FastifyInstance } from "fastify";
import { container } from "tsyringe";
import type { IBarbershopRepository } from "@/modules/barbershops/repositories/IBarbershopRepository";

// The app normally registers database-backed routes.  The security checks below
// exercise the real HTTP plugin configuration with a local, inert route only.
vi.mock("./routes", () => ({
  registerRoutes: async (app: FastifyInstance) => {
    app.get("/pentest/ping", async () => ({ ok: true }));
  },
}));

// O CORS vive neste escopo (/api); o ping daqui embaixo também fica sob /api.
// O mock preserva o plugin CORS real com as opções reais (corsOptions.ts) — só
// as rotas de domínio é que ficam de fora.
vi.mock("./routes/api", async () => {
  const { default: cors } = await import("@fastify/cors");
  const { corsOptions } = await import("./corsOptions");
  return {
    apiRoutes: async (app: FastifyInstance) => {
      await app.register(cors, corsOptions);
      app.get("/pentest/ping", async () => ({ ok: true }));
    },
  };
});

vi.mock("@/config/swagger", () => ({
  setupSwagger: async () => undefined,
}));

vi.mock("@/libs/prismaClient", () => ({
  prisma: { auditLog: { create: vi.fn() } },
}));

describe("HTTP security baseline (local inject)", () => {
  let app: FastifyInstance;
  const originalEnv = {
    NODE_ENV: process.env.NODE_ENV,
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
  };

  beforeEach(async () => {
    process.env.NODE_ENV = "test";
    process.env.ALLOWED_ORIGINS = "https://console.example.test";
    const { buildApp } = await import("./app");
    // Repo fake: só a rota /s/salon/:id usa repositório aqui (as demais rotas
    // de domínio estão mockadas acima).
    container.register<IBarbershopRepository>("BarbershopRepository", {
      useValue: {
        findByIdPublic: vi.fn().mockResolvedValue(null),
      } as unknown as IBarbershopRepository,
    });
    app = await buildApp();
    await app.ready();
  });

  afterEach(async () => {
    await app?.close();
    if (originalEnv.NODE_ENV === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnv.NODE_ENV;
    if (originalEnv.ALLOWED_ORIGINS === undefined) delete process.env.ALLOWED_ORIGINS;
    else process.env.ALLOWED_ORIGINS = originalEnv.ALLOWED_ORIGINS;
  });

  it("allows only configured CORS origins", async () => {
    const allowed = await app.inject({
      method: "OPTIONS",
      url: "/api/pentest/ping",
      headers: {
        origin: "https://console.example.test",
        "access-control-request-method": "GET",
      },
    });
    expect(allowed.statusCode).toBe(204);
    expect(allowed.headers["access-control-allow-origin"]).toBe(
      "https://console.example.test"
    );

    const rejected = await app.inject({
      method: "OPTIONS",
      url: "/api/pentest/ping",
      headers: {
        origin: "https://untrusted.example.test",
        "access-control-request-method": "GET",
      },
    });
    expect(rejected.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("não emite cabeçalhos CORS fora de /api", async () => {
    // /health, /s/salon/:id e o swagger não são API JSON cross-origin.
    const outside = await app.inject({
      method: "GET",
      url: "/pentest/ping",
      headers: { origin: "https://console.example.test" },
    });
    expect(outside.statusCode).toBe(200);
    expect(outside.headers["access-control-allow-origin"]).toBeUndefined();

    const preflight = await app.inject({
      method: "OPTIONS",
      url: "/pentest/ping",
      headers: {
        origin: "https://console.example.test",
        "access-control-request-method": "GET",
      },
    });
    expect(preflight.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("recusa origem fora da whitelist com 403 (nunca 500)", async () => {
    const evil = { origin: "https://untrusted.example.test" };

    // Requisição real: o callback de origin passava um Error genérico, que caía
    // no fallback do error handler e virava 500 "Erro interno do servidor".
    const actual = await app.inject({
      method: "GET",
      url: "/api/pentest/ping",
      headers: evil,
    });
    expect(actual.statusCode).toBe(403);
    expect(actual.json()).toMatchObject({ success: false });
    expect(actual.headers["access-control-allow-origin"]).toBeUndefined();

    // Preflight também era 500.
    const preflight = await app.inject({
      method: "OPTIONS",
      url: "/api/pentest/ping",
      headers: { ...evil, "access-control-request-method": "GET" },
    });
    expect(preflight.statusCode).toBe(403);
    expect(preflight.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("origem permitida segue respondendo normalmente", async () => {
    const ok = await app.inject({
      method: "GET",
      url: "/api/pentest/ping",
      headers: { origin: "https://console.example.test" },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers["access-control-allow-origin"]).toBe(
      "https://console.example.test"
    );
  });

  it("adds baseline hardening headers", async () => {
    const response = await app.inject({ method: "GET", url: "/pentest/ping" });
    expect(response.statusCode).toBe(200);
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(response.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(response.headers["cross-origin-opener-policy"]).toBe("same-origin");
    expect(response.headers["cross-origin-resource-policy"]).toBe("cross-origin");
  });

  it("página pública /s/salon/:id responde HTML fora do escopo CORS", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/s/salon/00000000-0000-0000-0000-000000000000",
      headers: { origin: "https://console.example.test" },
    });

    expect(response.statusCode).toBe(404);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.body).not.toContain("<script");
  });

  it("enforces the global local rate limit", async () => {
    for (let index = 0; index < 400; index += 1) {
      const response = await app.inject({ method: "GET", url: "/pentest/ping" });
      expect(response.statusCode).toBe(200);
    }
    const limited = await app.inject({ method: "GET", url: "/pentest/ping" });
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toMatchObject({ success: false });
  });
});
