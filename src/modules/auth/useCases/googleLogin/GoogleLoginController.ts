import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { validateSchema } from "@/shared/utils/zodValidation";
import { googleLoginSchema } from "../../schemas/authSchemas";
import { GoogleLoginUseCase } from "./GoogleLoginUseCase";

export const validateGoogleLogin = validateSchema(googleLoginSchema);

export class GoogleLoginController {
  async handle(request: FastifyRequest, reply: FastifyReply) {
    const { idToken } = request.body as { idToken: string };
    const useCase = container.resolve(GoogleLoginUseCase);
    const result = await useCase.execute(idToken);
    return reply.status(200).send(result);
  }
}
