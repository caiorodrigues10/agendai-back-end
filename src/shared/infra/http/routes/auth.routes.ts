import { FastifyInstance } from "fastify";
import { LoginController, validateLogin } from "@/modules/auth/useCases/login/LoginController";
import { RefreshController, validateRefresh } from "@/modules/auth/useCases/refresh/RefreshController";
import { MeController, mePreHandler } from "@/modules/auth/useCases/me/MeController";
import { RegisterController, validateRegister } from "@/modules/auth/useCases/register/RegisterController";
import { VerifyEmailController } from "@/modules/auth/controllers/VerifyEmailController";
import { GoogleLoginController, validateGoogleLogin } from "@/modules/auth/useCases/googleLogin/GoogleLoginController";
import { LogoutController } from "@/modules/auth/useCases/logout/LogoutController";
import { ForgotPasswordController, validateForgotPassword } from "@/modules/auth/useCases/forgotPassword/ForgotPasswordController";
import { ResetPasswordController, validateResetPassword } from "@/modules/auth/useCases/resetPassword/ResetPasswordController";
import { authenticate } from "@/shared/infra/http/middlewares/authenticate";
import { setRlsContext } from "@/shared/infra/http/middlewares/setRlsContext";
import { verifyRecaptcha } from "@/shared/infra/http/middlewares/verifyRecaptcha";

const authRateLimit = {
  config: {
    rateLimit: {
      max: 10,
      timeWindow: "1 minute",
    },
  },
};

export async function authRoutes(app: FastifyInstance) {
  const login = new LoginController();
  const refresh = new RefreshController();
  const me = new MeController();
  const register = new RegisterController();
  const verifyEmail = new VerifyEmailController();
  const googleLogin = new GoogleLoginController();
  const logout = new LogoutController();
  const forgotPassword = new ForgotPasswordController();
  const resetPassword = new ResetPasswordController();

  app.post("/auth/login", { ...authRateLimit, preHandler: [validateLogin, verifyRecaptcha] }, login.handle.bind(login));
  app.post("/auth/register", { ...authRateLimit, preHandler: [validateRegister, verifyRecaptcha] }, register.handle.bind(register));
  app.post("/auth/refresh", { ...authRateLimit, preHandler: [validateRefresh] }, refresh.handle.bind(refresh));
  app.get("/auth/me", { preHandler: [mePreHandler] }, me.handle.bind(me));
  app.get("/auth/verify-email", {
    config: { rateLimit: { max: 5, timeWindow: "5 minutes" } },
  }, (req, reply) => verifyEmail.handle(req, reply));
  app.post("/auth/google", { ...authRateLimit, preHandler: [validateGoogleLogin] }, googleLogin.handle.bind(googleLogin));

  app.post("/auth/forgot-password", {
    config: { rateLimit: { max: 3, timeWindow: "1 hour" } },
    preHandler: [validateForgotPassword, verifyRecaptcha],
  }, forgotPassword.handle.bind(forgotPassword));

  app.post("/auth/reset-password", {
    config: { rateLimit: { max: 5, timeWindow: "1 hour" } },
    preHandler: [validateResetPassword],
  }, resetPassword.handle.bind(resetPassword));

  app.post("/auth/logout", { preHandler: [authenticate, setRlsContext] }, logout.handle.bind(logout));
  app.post("/auth/revoke-all-sessions", { preHandler: [authenticate, setRlsContext] }, logout.revokeAllSessions.bind(logout));
}
