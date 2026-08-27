import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { validateSchema } from "@/shared/utils/zodValidation";
import { loginSchema } from "../../schemas/authSchemas";
import { LoginUseCase } from "./LoginUseCase";
import { logAccess } from "@/shared/services/accessLogService";
import { checkLock, recordFailure, resetAttempts } from "@/shared/services/bruteForceProtection";
import { AppError } from "@/shared/errors/AppError";

export const validateLogin = validateSchema(loginSchema);

export class LoginController {
  async handle(request: FastifyRequest, reply: FastifyReply) {
    const { email, password } = request.body as { email: string; password: string };
    const ip = request.ip;

    const lock = await checkLock(email, ip);
    if (lock.locked) {
      throw new AppError(
        `Conta bloqueada por múltiplas tentativas. Tente novamente em ${lock.retryAfterSeconds} segundos.`,
        423,
      );
    }

    const useCase = container.resolve(LoginUseCase);
    try {
      const result = await useCase.execute(email, password, reply);
      await resetAttempts(email, ip);
      logAccess({
        email,
        action: "LOGIN",
        ipAddress: ip,
        userAgent: request.headers["user-agent"],
        success: true,
      });
      return reply.status(200).send(result);
    } catch (err) {
      if (err instanceof AppError && err.statusCode === 401) {
        const failure = await recordFailure(email, ip);
        if (failure.locked) {
          throw new AppError(
            `Conta bloqueada por múltiplas tentativas. Tente novamente em ${failure.retryAfterSeconds} segundos.`,
            423,
          );
        }
      }
      logAccess({
        email,
        action: "LOGIN_FAILED",
        ipAddress: ip,
        userAgent: request.headers["user-agent"],
        success: false,
      });
      throw err;
    }
  }
}
