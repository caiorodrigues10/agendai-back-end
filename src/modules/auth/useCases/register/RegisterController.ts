import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { validateSchema } from "@/shared/utils/zodValidation";
import { registerSchema } from "../../schemas/authSchemas";
import { RegisterUseCase } from "./RegisterUseCase";

export const validateRegister = validateSchema(registerSchema);

export class RegisterController {
  async handle(request: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(RegisterUseCase);
    const result = await useCase.execute(request.body as any);
    return reply.status(201).send(result);
  }
}
