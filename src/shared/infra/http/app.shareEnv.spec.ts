/// <reference types="vitest/globals" />
import type { FastifyInstance } from "fastify";

// Rotas de domínio, Swagger e Prisma ficam de fora: aqui só interessa o que o
// buildApp() loga no boot.
vi.mock("./routes", () => ({ registerRoutes: async () => undefined }));
vi.mock("./routes/api", () => ({ apiRoutes: async () => undefined }));
vi.mock("@/config/swagger", () => ({ setupSwagger: async () => undefined }));
vi.mock("@/libs/prismaClient", () => ({ prisma: {} }));

const { shareWarnings } = vi.hoisted(() => ({ shareWarnings: [] as string[] }));

vi.mock("@/shared/utils/logger", () => {
  const log = {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    silent: vi.fn(),
    warn: (...args: unknown[]) => {
      for (const arg of args) {
        if (typeof arg === "string") shareWarnings.push(arg);
      }
    },
    child: () => log,
    level: "silent",
  };
  return { getModuleLogger: () => log, logger: log, withCorrelationLogs: (value: unknown) => value };
});

function shareWarningsAtBoot(): string[] {
  shareWarnings.length = 0;
  return shareWarnings;
}

describe("boot: avisos de env da página de compartilhamento", () => {
  const originalEnv = {
    NODE_ENV: process.env.NODE_ENV,
    PUBLIC_APP_URL: process.env.PUBLIC_APP_URL,
    PUBLIC_API_URL: process.env.PUBLIC_API_URL,
    TRUST_PROXY: process.env.TRUST_PROXY,
  };

  let app: FastifyInstance;

  afterEach(async () => {
    await app?.close();
    for (const key of Object.keys(originalEnv) as (keyof typeof originalEnv)[]) {
      const value = originalEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  async function buildWithEnv(env: Record<string, string | undefined>): Promise<string[]> {
    for (const [key, value] of Object.entries({
      PUBLIC_APP_URL: undefined,
      PUBLIC_API_URL: undefined,
      TRUST_PROXY: undefined,
      ...env,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }

    const { buildApp } = await import("./app");
    const warnings = shareWarningsAtBoot();
    app = await buildApp();
    await app.ready();
    return warnings.filter((message) => message.includes("PUBLIC_"));
  }

  it("em produção, sem PUBLIC_APP_URL/PUBLIC_API_URL, avisa no boot as duas", async () => {
    const warnings = await buildWithEnv({ NODE_ENV: "production" });

    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain("PUBLIC_APP_URL ausente em produção");
    expect(warnings[1]).toContain("PUBLIC_API_URL ausente em produção");
  });

  it("em produção com as duas envs não avisa nada sobre compartilhamento", async () => {
    const warnings = await buildWithEnv({
      NODE_ENV: "production",
      PUBLIC_APP_URL: "https://agendai.example.com",
      PUBLIC_API_URL: "https://api.agendai.example.com",
    });

    expect(warnings).toEqual([]);
  });

  it("fora de produção não avisa, mesmo sem as envs", async () => {
    const warnings = await buildWithEnv({ NODE_ENV: "test" });

    expect(warnings).toEqual([]);
  });
});
