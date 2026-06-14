import { FastifyInstance } from "fastify";

export async function registerRoutes(app: FastifyInstance) {
  // Rota de health-check (não entra no prefixo /api)
  app.get("/health", async () => ({ status: "ok" }));
}
