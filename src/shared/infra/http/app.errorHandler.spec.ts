/// <reference types="vitest/globals" />
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Prisma } from "@prisma/client";

vi.mock("./routes", () => ({
  registerRoutes: async (app: FastifyInstance) => {
    app.get("/test/zod", async () => {
      z.object({ barbershopId: z.string().uuid() }).parse({ barbershopId: "bad" });
    });
    app.get("/test/prisma-uuid", async () => {
      throw new Prisma.PrismaClientKnownRequestError(
        'Inconsistent column data: invalid input syntax for type uuid: "abc" SELECT * FROM "ShowcaseEntry"',
        { code: "P2023", clientVersion: "6.4.0" },
      );
    });
    app.get("/test/boom", async () => {
      throw new Error("secret internal stack");
    });
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
    errorLog: { create: vi.fn().mockResolvedValue(undefined) },
  },
}));

describe("HTTP error handler", () => {
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

  it("maps ZodError to 400 with field errors and no issues/stack", async () => {
    const response = await app.inject({ method: "GET", url: "/test/zod" });
    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.success).toBe(false);
    expect(body.message).toBe("Dados inválidos");
    expect(body.errors).toEqual([
      expect.objectContaining({ field: "barbershopId", message: expect.any(String) }),
    ]);
    expect(body.correlationId).toEqual(expect.any(String));
    expect(body).not.toHaveProperty("issues");
    expect(JSON.stringify(body)).not.toContain("stack");
    expect(JSON.stringify(body)).not.toContain("ZodError");
  });

  it("maps Prisma P2023 to 400 without SQL", async () => {
    const response = await app.inject({ method: "GET", url: "/test/prisma-uuid" });
    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body).toMatchObject({
      success: false,
      message: "Identificador inválido",
    });
    expect(body.correlationId).toEqual(expect.any(String));
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("SELECT");
    expect(serialized).not.toContain("ShowcaseEntry");
    expect(serialized).not.toContain("invalid input syntax");
    expect(body).not.toHaveProperty("code");
  });

  it("keeps unknown errors as generic 500", async () => {
    const response = await app.inject({ method: "GET", url: "/test/boom" });
    expect(response.statusCode).toBe(500);
    const body = response.json();
    expect(body).toMatchObject({
      success: false,
      message: "Erro interno do servidor",
    });
    expect(JSON.stringify(body)).not.toContain("secret internal stack");
  });
});
