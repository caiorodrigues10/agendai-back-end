/// <reference types="vitest/globals" />
import fastify, { FastifyInstance } from "fastify";

vi.mock("@/libs/prismaClient", () => ({
  prisma: { $queryRaw: vi.fn() },
}));

vi.mock("@/shared/infra/queue/redisConnection", () => ({
  getRedisConnection: vi.fn(),
}));

type PrismaMock = { $queryRaw: ReturnType<typeof vi.fn> };

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("health probes", () => {
  let app: FastifyInstance;
  let prismaMock: PrismaMock;
  let redisMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    prismaMock = (await import("@/libs/prismaClient"))
      .prisma as unknown as PrismaMock;
    prismaMock.$queryRaw.mockResolvedValue([]);
    redisMock = (await import("@/shared/infra/queue/redisConnection"))
      .getRedisConnection as unknown as ReturnType<typeof vi.fn>;
    redisMock.mockReturnValue({
      ping: vi.fn().mockResolvedValue("PONG"),
    });
    delete process.env.INTERNAL_HEALTH_TOKEN;

    const { healthRoutes } = await import("./health");
    app = fastify({ logger: false });
    await app.register(healthRoutes);
    await app.ready();
    await flush();
  });

  afterEach(async () => {
    await app?.close();
    delete process.env.INTERNAL_HEALTH_TOKEN;
  });

  it("GET /live responde 200 sem consultar dependências", async () => {
    const prismaCalls = prismaMock.$queryRaw.mock.calls.length;
    const redisCalls = redisMock.mock.calls.length;

    const response = await app.inject({ method: "GET", url: "/live" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "live",
      timestamp: expect.any(String),
    });
    expect(prismaMock.$queryRaw.mock.calls.length).toBe(prismaCalls);
    expect(redisMock.mock.calls.length).toBe(redisCalls);
  });

  it("GET /ready devolve 200 com Postgres + Redis e cacheia o resultado", async () => {
    const first = await app.inject({ method: "GET", url: "/ready" });

    expect(first.statusCode).toBe(200);
    const body = first.json() as {
      status: string;
      checks: {
        postgres: { status: string; latencyMs: number };
        redis: { status: string; latencyMs: number };
      };
    };
    expect(body.status).toBe("ready");
    expect(body.checks.postgres.status).toBe("ok");
    expect(body.checks.redis.status).toBe("ok");
    expect(body).not.toHaveProperty("checks.migrations");

    const callsAfterFirst = prismaMock.$queryRaw.mock.calls.length;
    const second = await app.inject({ method: "GET", url: "/ready" });

    expect(second.statusCode).toBe(200);
    expect(prismaMock.$queryRaw.mock.calls.length).toBe(callsAfterFirst);
  });

  it("GET /ready devolve 503 quando o Postgres falha", async () => {
    prismaMock.$queryRaw.mockRejectedValue(new Error("connection refused"));

    const response = await app.inject({ method: "GET", url: "/ready" });

    expect(response.statusCode).toBe(503);
    const body = response.json() as {
      status: string;
      checks: { postgres: { status: string; error?: string } };
    };
    expect(body.status).toBe("not_ready");
    expect(body.checks.postgres.status).toBe("error");
    expect(body.checks.postgres.error).toContain("connection refused");
  });

  it("GET /ready aplica deadline por checagem", async () => {
    prismaMock.$queryRaw.mockImplementation(() => new Promise(() => undefined));

    const response = await app.inject({ method: "GET", url: "/ready" });

    expect(response.statusCode).toBe(503);
    const body = response.json() as {
      checks: { postgres: { status: string; error?: string } };
    };
    expect(body.checks.postgres.status).toBe("error");
    expect(body.checks.postgres.error).toMatch(/3000ms/);
  });

  it("GET /health mantém o contrato legado sem expor papel/uptime", async () => {
    const base = prismaMock.$queryRaw.mock.calls.length;

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      status: string;
      checks: Record<string, unknown>;
    };
    expect(["ok", "degraded"]).toContain(body.status);
    expect(body.checks.postgres).toBeDefined();
    expect(body.checks.db).toBe(body.checks.postgres);
    expect(body.checks.redis).toBeDefined();
    const migrations = body.checks.migrations as {
      status: string;
      pending: number;
    };
    expect(["ok", "pending", "error"]).toContain(migrations.status);
    expect(typeof migrations.pending).toBe("number");
    expect(["healthy", "degraded"]).toContain(
      (body.checks.storage as { status: string }).status,
    );
    expect(body).not.toHaveProperty("role");
    expect(body).not.toHaveProperty("uptime");

    expect(prismaMock.$queryRaw.mock.calls.length).toBe(base + 1);

    await app.inject({ method: "GET", url: "/health" });
    expect(prismaMock.$queryRaw.mock.calls.length).toBe(base + 2);
  });

  it("GET /internal/health recusa cliente externo sem token", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/internal/health",
      remoteAddress: "203.0.113.50",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      message: "Acesso não autorizado",
    });
  });

  it("GET /internal/health aceita loopback com diagnóstico completo", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/internal/health",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      status: string;
      uptime: number;
      role: string;
      migrationsCheckedAt: string;
      checks: Record<string, unknown>;
    };
    expect(["ok", "degraded"]).toContain(body.status);
    expect(typeof body.uptime).toBe("number");
    expect(typeof body.role).toBe("string");
    expect(typeof body.migrationsCheckedAt).toBe("string");
    expect(body.checks.postgres).toBeDefined();
    expect(body.checks.redis).toBeDefined();
    expect(body.checks.migrations).toBeDefined();
    expect(body.checks.storage).toBeDefined();
  });

  it("GET /internal/health aceita token válido e recusa token errado", async () => {
    process.env.INTERNAL_HEALTH_TOKEN = "internal-health-token-abc123";

    const wrong = await app.inject({
      method: "GET",
      url: "/internal/health",
      remoteAddress: "203.0.113.60",
      headers: { "x-internal-health-token": "errado" },
    });
    expect(wrong.statusCode).toBe(401);

    const valid = await app.inject({
      method: "GET",
      url: "/internal/health",
      remoteAddress: "203.0.113.60",
      headers: { "x-internal-health-token": "internal-health-token-abc123" },
    });
    expect(valid.statusCode).toBe(200);
  });
});
