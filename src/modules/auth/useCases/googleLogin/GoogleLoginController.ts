import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { validateSchema } from "@/shared/utils/zodValidation";
import { googleLoginSchema } from "../../schemas/authSchemas";
import { GoogleLoginUseCase } from "./GoogleLoginUseCase";
import { AppError } from "@/shared/errors/AppError";
import { logAccess } from "@/shared/services/accessLogService";

export const validateGoogleLogin = validateSchema(googleLoginSchema);

export class GoogleLoginController {
  async handle(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { idToken } = request.body as { idToken: string };
      const useCase = container.resolve(GoogleLoginUseCase);
      const result = await useCase.execute(idToken, reply, {
        ip: request.ip,
        userAgent: request.headers["user-agent"],
      });
      logAccess({
        userId: (result as any)?.user?.id,
        action: "GOOGLE_LOGIN",
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"],
        success: true,
      });
      return reply.status(200).send(result);
    } catch (err) {
      // Conta bloqueada (423): igual ao LoginController — o bloqueio não é uma
      // tentativa nova, então não grava AccessLog nem loga como erro.
      if (err instanceof AppError && err.statusCode === 423) {
        throw err;
      }
      // GOOGLE_SUB_MISMATCH é sinal interno do use case: registra um AccessLog
      // com código próprio (action própria) e sai daqui SEM o code — o cliente
      // recebe um 401 genérico, indistinguível de credencial errada. O
      // request.log acima mantém o detalhe no servidor.
      const isSubMismatch = err instanceof AppError && err.code === "GOOGLE_SUB_MISMATCH";
      logAccess({
        action: isSubMismatch ? "GOOGLE_SUB_MISMATCH" : "LOGIN_FAILED",
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"],
        success: false,
      });
      request.log.error({ err }, "Google login failed");
      if (err instanceof AppError) {
        if (isSubMismatch) throw new AppError(err.message, err.statusCode);
        throw err;
      }
      throw new AppError("Falha ao autenticar com Google", 500);
    }
  }
}
