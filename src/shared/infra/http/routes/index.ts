import { FastifyInstance } from "fastify";
import { usersRoutes } from "./users.routes";
import { servicesRoutes } from "./services.routes";
import { barbershopsRoutes } from "./barbershops.routes";

export async function registerRoutes(app: FastifyInstance) {
  app.get("/health", async () => ({ status: "ok" }));
  await usersRoutes(app);
  await servicesRoutes(app);
  await barbershopsRoutes(app);
}
