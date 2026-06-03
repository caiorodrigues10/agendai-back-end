import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { validateSchema } from "@/shared/utils/zodValidation";
import { loginSchema } from "../../schemas/authSchemas";
import { LoginUseCase } from "./LoginUseCase";

export const validateLogin = validateSchema(loginSchema);

export class LoginController {
  async handle(request: FastifyRequest, reply: FastifyReply) {
    const { email, password } = request.body as { email: string; password: string };
    const useCase = container.resolve(LoginUseCase);
    const result = await useCase.execute(email, password);
    return reply.status(200).send(result);
  }
}
