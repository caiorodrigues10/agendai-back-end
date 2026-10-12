/// <reference types="vitest/globals" />
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { sign } from "jsonwebtoken";
import auth from "@/config/auth";

// Rotas reais de auth (login/refresh) com os limites reais de rota; o restante
// da API fica de fora para o teste não depender do banco.
vi.mock("./routes/api", async () => {
  const { authRoutes } = await import("./routes/auth.routes");
  return {
    apiRoutes: async (app: FastifyInstance) => {
      await authRoutes(app);
    },
  };
});

vi.mock("./routes", () => ({
  registerRoutes: async () => undefined,
}));

vi.mock("@/config/swagger", () => ({
  setupSwagger: async () => undefined,
}));

vi.mock("@/libs/prismaClient", () => ({
  prisma: {
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    errorLog: { create: vi.fn().mockResolvedValue({}) },
    refreshToken: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockImplementation(async ({ data }: { data: unknown }) => data),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    userSession: {
      findUnique: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    user: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
    },
  },
}));

/**
 * Comportamento dos limites de auth **em produção, sem `LOGIN_RATE_LIMIT_MAX`**:
 * o login segue em 10/min e o refresh tem teto próprio mais alto (o front renova
 * a sessão a cada carregamento de página — ver `refreshRateLimit`).
 */
describe("rate limit de auth em produção (NODE_ENV=production, sem LOGIN_RATE_LIMIT_MAX)", () => {
  const originalEnv = {
    NODE_ENV: process.env.NODE_ENV,
    LOGIN_RATE_LIMIT_MAX: process.env.LOGIN_RATE_LIMIT_MAX,
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
    LOG_LEVEL: process.env.LOG_LEVEL,
  };
  let app: FastifyInstance;
  /** Importado DEPOIS de NODE_ENV=production para o limite ser o de produção. */
  let refreshLimitMax: number;

  const jsonHeaders = { "content-type": "application/json" };

  async function post(
    url: string,
    payload: Record<string, unknown>,
    headers: Record<string, string> = {},
  ): Promise<{ statusCode: number }> {
    const res = await app.inject({ method: "POST", url, payload, headers: { ...jsonHeaders, ...headers } });
    return res;
  }

  beforeAll(async () => {
    process.env.NODE_ENV = "production";
    delete process.env.LOGIN_RATE_LIMIT_MAX;
    process.env.ALLOWED_ORIGINS = "https://console.example.test";
    process.env.LOG_LEVEL = "silent"; // ~360 requisições não precisam de log

    const [{ buildApp }, { REFRESH_RATE_LIMIT_MAX }] = await Promise.all([
      import("./app"),
      import("./authRateLimit"),
    ]);
    refreshLimitMax = REFRESH_RATE_LIMIT_MAX;
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
    if (originalEnv.NODE_ENV === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnv.NODE_ENV;
    if (originalEnv.LOGIN_RATE_LIMIT_MAX === undefined) delete process.env.LOGIN_RATE_LIMIT_MAX;
    else process.env.LOGIN_RATE_LIMIT_MAX = originalEnv.LOGIN_RATE_LIMIT_MAX;
    if (originalEnv.ALLOWED_ORIGINS === undefined) delete process.env.ALLOWED_ORIGINS;
    else process.env.ALLOWED_ORIGINS = originalEnv.ALLOWED_ORIGINS;
    if (originalEnv.LOG_LEVEL === undefined) delete process.env.LOG_LEVEL;
    else process.env.LOG_LEVEL = originalEnv.LOG_LEVEL;
  });

  it("login continua com 10/min mesmo sem a env de afrouxamento", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 11; i += 1) {
      const res = await post("/api/auth/login", { email: "admin@admin.com", password: "admin123" });
      statuses.push(res.statusCode);
    }

    expect(statuses.slice(0, 10)).not.toContain(429);
    expect(statuses[10]).toBe(429);
  });

  it("refresh tem teto próprio: a 11ª chamada não é 429 e o limite é o de refresh", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < refreshLimitMax + 1; i += 1) {
      const res = await post("/api/auth/refresh", {});
      statuses.push(res.statusCode);
    }

    // Acima do limite de login (10) — o refresh não herda o balde do login.
    expect(statuses[10]).not.toBe(429);
    expect(statuses.slice(0, refreshLimitMax)).not.toContain(429);
    expect(statuses[refreshLimitMax]).toBe(429);
  });

  it("sessão com cookie válido não cai junto com o IP lotado", async () => {
    // Esvaza o balde por IP com cookies forjados (sem assinatura válida).
    for (let i = 0; i < refreshLimitMax; i += 1) {
      await post("/api/auth/refresh", {}, { cookie: `refresh_token=forjado-${i}` });
    }
    const forged = await post("/api/auth/refresh", {}, { cookie: "refresh_token=forjado-x" });
    expect(forged.statusCode).toBe(429);

    // Cookie de sessão assinado com o segredo real: balde diferente (sessão),
    // então o IP lotado não derruba quem tem sessão ativa.
    const signed = sign({ sub: randomUUID(), jti: randomUUID(), purpose: "session" }, auth.refreshSecret, {
      expiresIn: "7d",
    });
    const withSession = await post("/api/auth/refresh", {}, { cookie: `refresh_token=${signed}` });
    expect(withSession.statusCode).not.toBe(429);
  });
});
