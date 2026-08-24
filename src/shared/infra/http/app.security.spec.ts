import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

// The app normally registers database-backed routes.  The security checks below
// exercise the real HTTP plugin configuration with a local, inert route only.
vi.mock("./routes", () => ({
  registerRoutes: async (app: FastifyInstance) => {
    app.get("/health", async () => ({ status: "ok" }));
    app.get("/pentest/ping", async () => ({ ok: true }));
  },
}));

vi.mock("./routes/api", () => ({
  apiRoutes: async () => undefined,
}));

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
      url: "/pentest/ping",
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
      url: "/pentest/ping",
      headers: {
        origin: "https://untrusted.example.test",
        "access-control-request-method": "GET",
      },
    });
    expect(rejected.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("adds baseline hardening headers", async () => {
    const response = await app.inject({ method: "GET", url: "/pentest/ping" });
    expect(response.statusCode).toBe(200);
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-frame-options"]).toBe("SAMEORIGIN");
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
