/// <reference types="vitest/globals" />
import type { FastifyInstance } from "fastify";
import { buildApp, resolveTrustProxy } from "./app";

vi.mock("./routes", () => ({
  registerRoutes: async (app: FastifyInstance) => {
    app.get("/pentest/ip", async (request) => ({ ip: request.ip }));
  },
}));

vi.mock("./routes/api", () => ({
  apiRoutes: async () => undefined,
}));

vi.mock("@/config/swagger", () => ({
  setupSwagger: async () => undefined,
}));

vi.mock("@/libs/prismaClient", () => ({
  prisma: {
    auditLog: { create: vi.fn() },
    errorLog: { create: vi.fn() },
  },
}));

describe("TRUST_PROXY", () => {
  const originalTrustProxy = process.env.TRUST_PROXY;
  let app: FastifyInstance | undefined;

  async function buildWithTrustProxy(value: string | undefined) {
    if (value === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = value;

    const instance = await buildApp();
    await instance.ready();
    return instance;
  }

  afterEach(async () => {
    await app?.close();
    app = undefined;
    if (originalTrustProxy === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = originalTrustProxy;
  });

  it("ignora X-Forwarded-For por padrão", async () => {
    app = await buildWithTrustProxy(undefined);

    const response = await app.inject({
      method: "GET",
      url: "/pentest/ip",
      remoteAddress: "203.0.113.10",
      headers: { "x-forwarded-for": "198.51.100.7" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ip: "203.0.113.10" });
  });

  it("TRUST_PROXY=true confia no X-Forwarded-For", async () => {
    app = await buildWithTrustProxy("true");

    const response = await app.inject({
      method: "GET",
      url: "/pentest/ip",
      remoteAddress: "203.0.113.10",
      headers: { "x-forwarded-for": "198.51.100.7" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ip: "198.51.100.7" });
  });

  it("TRUST_PROXY numérico confia em N hops", async () => {
    app = await buildWithTrustProxy("1");

    const response = await app.inject({
      method: "GET",
      url: "/pentest/ip",
      remoteAddress: "203.0.113.10",
      headers: { "x-forwarded-for": "198.51.100.7" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ip: "198.51.100.7" });
  });

  it("faz parse defensivo do valor da env", async () => {
    process.env.TRUST_PROXY = "true";
    expect(resolveTrustProxy()).toBe(true);

    process.env.TRUST_PROXY = "false";
    expect(resolveTrustProxy()).toBe(false);

    process.env.TRUST_PROXY = "0";
    expect(resolveTrustProxy()).toBe(false);

    process.env.TRUST_PROXY = "3";
    expect(resolveTrustProxy()).toBe(3);

    process.env.TRUST_PROXY = "10.0.0.0/8, 172.16.0.0/12";
    expect(resolveTrustProxy()).toBe("10.0.0.0/8, 172.16.0.0/12");

    process.env.TRUST_PROXY = "qualquer-coisa!";
    expect(resolveTrustProxy()).toBe(false);

    delete process.env.TRUST_PROXY;
    expect(resolveTrustProxy()).toBe(false);
  });
});
