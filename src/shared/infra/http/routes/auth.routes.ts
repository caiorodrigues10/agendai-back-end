import { FastifyInstance } from "fastify";
import { LoginController, validateLogin } from "@/modules/auth/useCases/login/LoginController";
import { RefreshController, validateRefresh } from "@/modules/auth/useCases/refresh/RefreshController";
import { MeController, mePreHandler } from "@/modules/auth/useCases/me/MeController";

export async function authRoutes(app: FastifyInstance) {
  const login = new LoginController();
  const refresh = new RefreshController();
  const me = new MeController();

  app.post("/auth/login", { preHandler: [validateLogin] }, login.handle.bind(login));
  app.post("/auth/refresh", { preHandler: [validateRefresh] }, refresh.handle.bind(refresh));
  app.get("/auth/me", { preHandler: [mePreHandler] }, me.handle.bind(me));
}
