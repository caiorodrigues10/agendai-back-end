import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { validateSchema } from "@/shared/utils/zodValidation";
import { resetPasswordSchema } from "../../schemas/authSchemas";
import { ResetPasswordUseCase } from "./ResetPasswordUseCase";

export const validateResetPassword = validateSchema(resetPasswordSchema);

export class ResetPasswordController {
  async handle(request: FastifyRequest, reply: FastifyReply) {
    const { token, newPassword } = request.body as { token: string; newPassword: string };
    const useCase = container.resolve(ResetPasswordUseCase);
    const result = await useCase.execute(token, newPassword);
    return reply.status(200).send({ success: true, ...result });
  }
}
