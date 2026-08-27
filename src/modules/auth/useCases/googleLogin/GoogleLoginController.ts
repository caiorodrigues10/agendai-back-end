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
      const result = await useCase.execute(idToken, reply);
      logAccess({
        userId: (result as any)?.user?.id,
        action: "GOOGLE_LOGIN",
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"],
        success: true,
      });
      return reply.status(200).send(result);
    } catch (err) {
      logAccess({
        action: "LOGIN_FAILED",
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"],
        success: false,
      });
      request.log.error({ err }, "Google login failed");
      if (err instanceof AppError) throw err;
      throw new AppError("Falha ao autenticar com Google", 500);
    }
  }
}
