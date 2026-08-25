import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { validateSchema } from "@/shared/utils/zodValidation";
import { loginSchema } from "../../schemas/authSchemas";
import { LoginUseCase } from "./LoginUseCase";
import { logAccess } from "@/shared/services/accessLogService";

export const validateLogin = validateSchema(loginSchema);

export class LoginController {
  async handle(request: FastifyRequest, reply: FastifyReply) {
    const { email, password } = request.body as { email: string; password: string };
    const useCase = container.resolve(LoginUseCase);
    try {
      const result = await useCase.execute(email, password);
      await logAccess({
        email,
        action: "LOGIN",
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"],
        success: true,
      });
      return reply.status(200).send(result);
    } catch (err) {
      await logAccess({
        email,
        action: "LOGIN_FAILED",
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"],
        success: false,
      });
      throw err;
    }
  }
}
