import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { validateSchema } from "@/shared/utils/zodValidation";
import { registerWithGoogleSchema } from "../../schemas/authSchemas";
import { RegisterGoogleUseCase } from "./RegisterGoogleUseCase";
import { logAccess } from "@/shared/services/accessLogService";

export const validateRegisterWithGoogle = validateSchema(registerWithGoogleSchema);

export class RegisterGoogleController {
  async handle(request: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(RegisterGoogleUseCase);
    const result = await useCase.execute(request.body as any, reply);
    logAccess({
      userId: result.user?.id,
      email: result.user?.email,
      action: "REGISTER_GOOGLE",
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"],
      success: true,
    });
    return reply.status(201).send(result);
  }
}
