import "reflect-metadata";
import "@/shared/container";
import { buildApp } from "@/shared/infra/http/app";
import type { FastifyInstance } from "fastify";

/**
 * App Fastify pronto para `app.inject()` (sem listen).
 * Carrega o container DI real — use DATABASE_URL de teste/dev.
 */
export async function createTestApp(): Promise<FastifyInstance> {
  process.env.NODE_ENV = "test";
  const app = await buildApp();
  await app.ready();
  return app;
}

export async function closeTestApp(app: FastifyInstance): Promise<void> {
  await app.close();
}
