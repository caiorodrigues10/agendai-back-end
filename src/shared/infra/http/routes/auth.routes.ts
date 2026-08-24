import { FastifyInstance } from "fastify";
import { LoginController, validateLogin } from "@/modules/auth/useCases/login/LoginController";
import { RefreshController, validateRefresh } from "@/modules/auth/useCases/refresh/RefreshController";
import { MeController, mePreHandler } from "@/modules/auth/useCases/me/MeController";
import { RegisterController, validateRegister } from "@/modules/auth/useCases/register/RegisterController";
import { VerifyEmailController } from "@/modules/auth/controllers/VerifyEmailController";
import { GoogleLoginController, validateGoogleLogin } from "@/modules/auth/useCases/googleLogin/GoogleLoginController";

export async function authRoutes(app: FastifyInstance) {
  const login = new LoginController();
  const refresh = new RefreshController();
  const me = new MeController();
  const register = new RegisterController();
  const verifyEmail = new VerifyEmailController();
  const googleLogin = new GoogleLoginController();

  app.post("/auth/login", { preHandler: [validateLogin] }, login.handle.bind(login));
  app.post("/auth/register", { preHandler: [validateRegister] }, register.handle.bind(register));
  app.post("/auth/refresh", { preHandler: [validateRefresh] }, refresh.handle.bind(refresh));
  app.get("/auth/me", { preHandler: [mePreHandler] }, me.handle.bind(me));
  app.get("/auth/verify-email", (req, reply) => verifyEmail.handle(req, reply));
  app.post("/auth/google", { preHandler: [validateGoogleLogin] }, googleLogin.handle.bind(googleLogin));
}
