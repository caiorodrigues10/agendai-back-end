/**
 * Smoke tests for monitoring endpoints via Fastify inject.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { startPostgresHarness, type PostgresHarness } from "../helpers/postgres";

describe("Monitoring routes smoke (inject)", () => {
  let app: FastifyInstance;
  let harness: PostgresHarness;
  let closeTestApp: (app: FastifyInstance) => Promise<void>;

  beforeAll(async () => {
    harness = await startPostgresHarness();
    const helpers = await import("../helpers/createTestApp");
    closeTestApp = helpers.closeTestApp;
    app = await helpers.createTestApp();
  }, 180_000);

  afterAll(async () => {
    if (app && closeTestApp) await closeTestApp(app);
    if (harness) await harness.stop();
  });

  it("GET /health → 200 with checks.migrations", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      status: string;
      checks: {
        migrations: { status: string; pending: number };
        storage: { status: string; provider: string };
      };
    };
    expect(body.status).toBe("ok");
    expect(body.checks.migrations).toBeDefined();
    expect(["ok", "pending", "error"]).toContain(body.checks.migrations.status);
    expect(typeof body.checks.migrations.pending).toBe("number");
    expect(body.checks.storage).toBeDefined();
    expect(["healthy", "degraded"]).toContain(body.checks.storage.status);
  });

  it("GET /ready → 200 or 503 with checks.migrations", async () => {
    const res = await app.inject({ method: "GET", url: "/ready" });
    expect([200, 503]).toContain(res.statusCode);
    const body = res.json() as {
      status: string;
      checks: { migrations: { status: string } };
    };
    expect(["ready", "not_ready"]).toContain(body.status);
    expect(body.checks.migrations).toBeDefined();
    expect(["ok", "error"]).toContain(body.checks.migrations.status);
  });

  it("GET /api/monitoring/dashboard → 401 without auth", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/monitoring/dashboard",
    });
    expect(res.statusCode).toBe(401);
  });
});
