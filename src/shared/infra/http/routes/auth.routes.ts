import { FastifyInstance } from "fastify";
import { LoginController, validateLogin } from "@/modules/auth/useCases/login/LoginController";
import { RefreshController, validateRefresh } from "@/modules/auth/useCases/refresh/RefreshController";
import { MeController, mePreHandler } from "@/modules/auth/useCases/me/MeController";
import { RegisterController, validateRegister } from "@/modules/auth/useCases/register/RegisterController";
import { RegisterGoogleController, validateRegisterWithGoogle } from "@/modules/auth/useCases/registerGoogle/RegisterGoogleController";
import { VerifyEmailController } from "@/modules/auth/controllers/VerifyEmailController";
import { GoogleLoginController, validateGoogleLogin } from "@/modules/auth/useCases/googleLogin/GoogleLoginController";
import { LogoutController } from "@/modules/auth/useCases/logout/LogoutController";
import { SwitchAccountController, validateSwitchAccount } from "@/modules/auth/useCases/switchAccount/SwitchAccountController";
import { ForgotPasswordController, validateForgotPassword } from "@/modules/auth/useCases/forgotPassword/ForgotPasswordController";
import { ResetPasswordController, validateResetPassword } from "@/modules/auth/useCases/resetPassword/ResetPasswordController";
import { ResendVerificationEmailController } from "@/modules/auth/useCases/resendVerification/ResendVerificationEmailController";
import { authenticate } from "@/shared/infra/http/middlewares/authenticate";
import { setRlsContext } from "@/shared/infra/http/middlewares/setRlsContext";
import { verifyRecaptcha } from "@/shared/infra/http/middlewares/verifyRecaptcha";
import { resetByEmail, resetByIp } from "@/shared/services/bruteForceProtection";

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
  const registerGoogle = new RegisterGoogleController();
  const verifyEmail = new VerifyEmailController();
  const googleLogin = new GoogleLoginController();
  const logout = new LogoutController();
  const switchAccount = new SwitchAccountController();
  const forgotPassword = new ForgotPasswordController();
  const resetPassword = new ResetPasswordController();
  const resendVerification = new ResendVerificationEmailController();

  app.post("/auth/login", { ...authRateLimit, preHandler: [validateLogin, verifyRecaptcha] }, login.handle.bind(login));
  app.post("/auth/register", { ...authRateLimit, preHandler: [validateRegister, verifyRecaptcha] }, register.handle.bind(register));
  app.post("/auth/register-google", { ...authRateLimit, preHandler: [validateRegisterWithGoogle, verifyRecaptcha] }, registerGoogle.handle.bind(registerGoogle));
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

  app.post("/auth/resend-verification", {
    config: { rateLimit: { max: 3, timeWindow: "10 minutes" } },
    preHandler: [authenticate, setRlsContext],
  }, resendVerification.handle.bind(resendVerification));

  // Contas salvas — NÃO requer autenticação (acesso via cookie saved_refresh)
  app.post("/auth/switch-account", { ...authRateLimit, preHandler: [validateSwitchAccount] }, switchAccount.handle.bind(switchAccount));
  app.post("/auth/forget-account", { ...authRateLimit, preHandler: [validateSwitchAccount] }, logout.forgetAccount.bind(logout));

  // ─── DEV ONLY: reset de rate limit ─────────────────────────────────────────
  // Só funciona quando NODE_ENV !== "production". Protegido por checagem dupla:
  // (1) rota só é registrada em dev, (2) handler verifica NODE_ENV internamente.
  if (process.env.NODE_ENV !== "production") {
    app.post("/dev/reset-rate-limit", async (request, reply) => {
      const { email, ip } = request.body as { email?: string; ip?: string };

      if (!email && !ip) {
        return reply.status(400).send({
          success: false,
          message: "Informe pelo menos um dos campos: email, ip",
        });
      }

      if (email) await resetByEmail(email);
      if (ip) await resetByIp(ip);

      return reply.status(200).send({
        success: true,
        message: `Rate limit resetado${email ? ` para email ${email}` : ""}${ip ? ` e IP ${ip}` : ""}`,
      });
    });
  }
}
