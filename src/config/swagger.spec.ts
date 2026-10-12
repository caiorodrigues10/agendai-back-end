/// <reference types="vitest/globals" />
import fastify, { FastifyInstance } from "fastify";
import { apiDocsServerUrl, isApiDocsEnabled, setupSwagger } from "./swagger";

async function buildDocsApp(): Promise<FastifyInstance> {
  const app = fastify({ logger: false });
  await setupSwagger(app);
  app.get("/ping", async () => ({ ok: true }));
  await app.ready();
  return app;
}

describe("Swagger /docs", () => {
  const originalEnv = {
    NODE_ENV: process.env.NODE_ENV,
    ENABLE_API_DOCS: process.env.ENABLE_API_DOCS,
    API_DOCS_SERVER_URL: process.env.API_DOCS_SERVER_URL,
  };
  let app: FastifyInstance | undefined;

  function restoreEnv() {
    if (originalEnv.NODE_ENV === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnv.NODE_ENV;
    if (originalEnv.ENABLE_API_DOCS === undefined) delete process.env.ENABLE_API_DOCS;
    else process.env.ENABLE_API_DOCS = originalEnv.ENABLE_API_DOCS;
    if (originalEnv.API_DOCS_SERVER_URL === undefined) delete process.env.API_DOCS_SERVER_URL;
    else process.env.API_DOCS_SERVER_URL = originalEnv.API_DOCS_SERVER_URL;
  }

  afterEach(async () => {
    await app?.close();
    app = undefined;
    restoreEnv();
  });

  it("fora de produção serve /docs e /docs/json", async () => {
    process.env.NODE_ENV = "development";
    delete process.env.ENABLE_API_DOCS;
    app = await buildDocsApp();

    const ui = await app.inject({ method: "GET", url: "/docs" });
    expect([200, 302]).toContain(ui.statusCode);

    const json = await app.inject({ method: "GET", url: "/docs/json" });
    expect(json.statusCode).toBe(200);
    expect(json.json()).toMatchObject({ openapi: expect.any(String) });
  });

  it("em produção /docs e /docs/json respondem 404", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.ENABLE_API_DOCS;
    app = await buildDocsApp();

    const ui = await app.inject({ method: "GET", url: "/docs" });
    expect(ui.statusCode).toBe(404);

    const json = await app.inject({ method: "GET", url: "/docs/json" });
    expect(json.statusCode).toBe(404);
  });

  it("em produção ENABLE_API_DOCS=true volta a servir o Swagger", async () => {
    process.env.NODE_ENV = "production";
    process.env.ENABLE_API_DOCS = "true";
    app = await buildDocsApp();

    const ui = await app.inject({ method: "GET", url: "/docs" });
    expect([200, 302]).toContain(ui.statusCode);

    const json = await app.inject({ method: "GET", url: "/docs/json" });
    expect(json.statusCode).toBe(200);
  });

  it("ENABLE_API_DOCS=false desliga /docs mesmo fora de produção", async () => {
    process.env.NODE_ENV = "development";
    process.env.ENABLE_API_DOCS = "false";
    app = await buildDocsApp();

    const ui = await app.inject({ method: "GET", url: "/docs" });
    expect(ui.statusCode).toBe(404);
  });

  it("servers[0].url vem de API_DOCS_SERVER_URL (padrão localhost)", async () => {
    process.env.NODE_ENV = "development";
    delete process.env.API_DOCS_SERVER_URL;
    expect(apiDocsServerUrl()).toBe("http://localhost:3333");
    app = await buildDocsApp();
    expect((app.swagger() as { servers?: { url?: string }[] }).servers?.[0]?.url).toBe(
      "http://localhost:3333"
    );
    await app.close();
    app = undefined;

    process.env.API_DOCS_SERVER_URL = "https://api.exemplo.com";
    expect(apiDocsServerUrl()).toBe("https://api.exemplo.com");
    app = await buildDocsApp();
    expect((app.swagger() as { servers?: { url?: string }[] }).servers?.[0]?.url).toBe(
      "https://api.exemplo.com"
    );
  });

  it("isApiDocsEnabled segue a matriz produção × ENABLE_API_DOCS", () => {
    process.env.NODE_ENV = "production";
    delete process.env.ENABLE_API_DOCS;
    expect(isApiDocsEnabled()).toBe(false);

    process.env.ENABLE_API_DOCS = "true";
    expect(isApiDocsEnabled()).toBe(true);

    process.env.NODE_ENV = "development";
    delete process.env.ENABLE_API_DOCS;
    expect(isApiDocsEnabled()).toBe(true);

    process.env.ENABLE_API_DOCS = "false";
    expect(isApiDocsEnabled()).toBe(false);
  });
});
