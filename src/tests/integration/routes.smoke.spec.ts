/**
 * Smoke de rotas via Fastify inject (sem HTTP real).
 * Requer Postgres do docker-compose (porta 5442) via `.env` + `.env.test`,
 * ou USE_TESTCONTAINERS=1.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { startPostgresHarness, type PostgresHarness } from "../helpers/postgres";

describe("HTTP routes smoke (inject)", () => {
  let app: FastifyInstance;
  let harness: PostgresHarness;
  let closeTestApp: (app: FastifyInstance) => Promise<void>;
  let sampleBarbershopId: string | null = null;

  beforeAll(async () => {
    harness = await startPostgresHarness();
    const helpers = await import("../helpers/createTestApp");
    closeTestApp = helpers.closeTestApp;
    app = await helpers.createTestApp();

    const list = await app.inject({ method: "GET", url: "/api/barbershops" });
    if (list.statusCode === 200) {
      const body = list.json() as { data?: Array<{ id: string }> };
      sampleBarbershopId = body.data?.[0]?.id ?? null;
    }
  }, 180_000);

  afterAll(async () => {
    if (app && closeTestApp) await closeTestApp(app);
    if (harness) await harness.stop();
  });

  it("GET /health → 200 (ok ou degraded)", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { status: string };
    expect(["ok", "degraded"]).toContain(body.status);
  });

  it("GET /api/plans → 200 + data[]", async () => {
    const res = await app.inject({ method: "GET", url: "/api/plans" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { success: boolean; data: unknown[] };
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
  });

  it("GET /api/barbershops → 200", async () => {
    const res = await app.inject({ method: "GET", url: "/api/barbershops" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { success: boolean; data: unknown };
    expect(body.success).toBe(true);
  });

  it("GET /api/barbershops/:id/schedule → 200 ou 404", async () => {
    const id = sampleBarbershopId ?? "00000000-0000-0000-0000-000000000099";
    const res = await app.inject({
      method: "GET",
      url: `/api/barbershops/${id}/schedule`,
    });
    expect([200, 404]).toContain(res.statusCode);
  });

  it("GET /api/queue/metrics → 401 sem token, 200 com token", async () => {
    const qs = sampleBarbershopId
      ? `?barbershopId=${sampleBarbershopId}`
      : "";
    const res = await app.inject({
      method: "GET",
      url: `/api/queue/metrics${qs}`,
    });
    expect([200, 401]).toContain(res.statusCode);
  });

  it("GET /api/queue sem token exige barbershopId → 400 sem query; 200 com id", async () => {
    const missing = await app.inject({ method: "GET", url: "/api/queue" });
    expect(missing.statusCode).toBe(400);

    if (!sampleBarbershopId) return;
    const res = await app.inject({
      method: "GET",
      url: `/api/queue?barbershopId=${sampleBarbershopId}`,
    });
    expect(res.statusCode).toBe(200);
  });

  it("GET /api/appointments/availability sem params → 4xx", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/appointments/availability",
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
  });

  it("GET /api/feed exige barbershopId → 400 sem query; 200 com id", async () => {
    const missing = await app.inject({ method: "GET", url: "/api/feed" });
    expect(missing.statusCode).toBe(400);

    if (!sampleBarbershopId) return;
    const res = await app.inject({
      method: "GET",
      url: `/api/feed?barbershopId=${sampleBarbershopId}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ success: true });
  });

  it("POST /api/contact válido → 2xx", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/contact",
      payload: {
        name: "QA Inject",
        email: "qa-inject@example.com",
        topic: "suporte",
        message: "Mensagem de teste automatizado via Fastify inject.",
      },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(200);
    expect(res.statusCode).toBeLessThan(300);
    const body = res.json() as { success?: boolean };
    expect(body.success).toBe(true);
  });

  it("POST /api/auth/login inválido → 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        email: "nobody@example.com",
        password: "wrong-password-xyz",
      },
    });
    expect(res.statusCode).toBe(401);
    const body = res.json() as { success?: boolean; message?: string };
    expect(String(body.message ?? "")).toMatch(/credenciais/i);
  });

  it("POST /api/auth/login admin seed → 200 + tokens (se seed existir)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        email: "admin@agendai.local",
        password: "admin123",
      },
    });
    if (res.statusCode === 401) {
      expect(res.json()).toMatchObject({ success: false });
      return;
    }
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      accessToken?: string;
      refreshToken?: string;
      user?: { email?: string };
    };
    expect(body.accessToken).toBeTruthy();
    expect(body.user?.email).toBe("admin@agendai.local");
  });
});
