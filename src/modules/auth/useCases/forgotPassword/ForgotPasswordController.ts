import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { validateSchema } from "@/shared/utils/zodValidation";
import { forgotPasswordSchema } from "../../schemas/authSchemas";
import { ForgotPasswordUseCase } from "./ForgotPasswordUseCase";

export const validateForgotPassword = validateSchema(forgotPasswordSchema);

export class ForgotPasswordController {
  async handle(request: FastifyRequest, reply: FastifyReply) {
    const { email } = request.body as { email: string };
    const useCase = container.resolve(ForgotPasswordUseCase);
    const result = await useCase.execute(email, request.ip);
    return reply.status(200).send({ success: true, ...result });
  }
}
