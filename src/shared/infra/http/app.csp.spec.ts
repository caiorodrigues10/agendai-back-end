/// <reference types="vitest/globals" />
import type { FastifyInstance } from "fastify";

// S6 — prova verificável da CSP de produção (commit 5a40d72):
// sobe o app de verdade com NODE_ENV=production e afirma que o header
// Content-Security-Policy existe e que o diretivo script-src NÃO contém
// 'unsafe-inline'. Padrão de /docs (só leitura + matriz completa em
// swagger.spec.ts): em produção ENABLE_API_DOCS é false por padrão → 404.
// Quando ligado (ENABLE_API_DOCS=true), a UI do @fastify/swagger-ui carrega
// apenas scripts externos de mesma origem (src=...), portanto a CSP com
// script-src 'self' NÃO quebra o Swagger — o teste registra essa garantia
// para que uma futura HTML com script inline seja pega aqui.
//
// Fora do escopo (não alterado): cookies, CORS, auth.

vi.mock("./routes", () => ({
  registerRoutes: async (app: FastifyInstance) => {
    app.get("/pentest/ping", async () => ({ ok: true }));
  },
}));

vi.mock("./routes/api", () => ({
  apiRoutes: async () => undefined,
}));

vi.mock("@/libs/prismaClient", () => ({
  prisma: { auditLog: { create: vi.fn() } },
}));

function scriptSrcDirective(csp: string): string {
  const m = csp.match(/(?:^|;)\s*script-src\s+([^;]+)/);
  return m ? m[1].trim() : "";
}

describe("CSP de produção sem 'unsafe-inline' em script-src (S6)", () => {
  let app: FastifyInstance | undefined;
  const originalEnv = {
    NODE_ENV: process.env.NODE_ENV,
    ENABLE_API_DOCS: process.env.ENABLE_API_DOCS,
    LOG_LEVEL: process.env.LOG_LEVEL,
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
  };

  beforeEach(() => {
    process.env.NODE_ENV = "production";
    process.env.LOG_LEVEL = "error";
    delete process.env.ENABLE_API_DOCS;
    delete process.env.ALLOWED_ORIGINS;
    app = undefined;
  });

  afterEach(async () => {
    await app?.close();
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("GET /health serve CSP com script-src presente e sem 'unsafe-inline'", async () => {
    const { buildApp } = await import("./app");
    app = await buildApp();
    await app.ready();

    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);

    const csp = res.headers["content-security-policy"];
    expect(csp, "CSP de produção deve existir").toBeTruthy();
    const scriptSrc = scriptSrcDirective(String(csp));
    expect(scriptSrc, "script-src deve estar declarado").not.toBe("");
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).toContain("'self'");
    expect(scriptSrc).toContain("https://www.google.com");
  });

  it("sem ENABLE_API_DOCS, produção responde 404 em /docs (padrão)", async () => {
    const { buildApp } = await import("./app");
    app = await buildApp();
    await app.ready();

    const res = await app.inject({ method: "GET", url: "/docs" });
    expect(res.statusCode).toBe(404);
  });

  it("com ENABLE_API_DOCS=true, /docs responde 200 sem script inline (CSP não quebra)", async () => {
    process.env.ENABLE_API_DOCS = "true";
    const { buildApp } = await import("./app");
    app = await buildApp();
    await app.ready();

    let res = await app.inject({ method: "GET", url: "/docs" });
    if (res.statusCode === 302 || res.statusCode === 301) {
      const location = String(res.headers.location).replace(/^https?:\/\/[^/]+/, "");
      res = await app.inject({ method: "GET", url: location });
    }
    expect(res.statusCode).toBe(200);

    const csp = res.headers["content-security-policy"];
    expect(csp).toBeTruthy();
    const scriptSrc = scriptSrcDirective(String(csp));
    expect(scriptSrc).not.toBe("");
    expect(scriptSrc).not.toContain("'unsafe-inline'");

    // Garantia de compatibilidade: nenhum <script> sem src (inline seria
    // bloqueado por script-src 'self' e derrubaria a UI do Swagger).
    const tags = res.body.match(/<script\b[^>]*>/g) ?? [];
    expect(tags.length, "HTML do /docs deve carregar scripts").toBeGreaterThan(0);
    for (const tag of tags) {
      expect(tag).toMatch(/\bsrc=/);
    }
  });
});
