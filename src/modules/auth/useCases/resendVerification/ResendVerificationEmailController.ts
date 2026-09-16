import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { ResendVerificationEmailUseCase } from "./ResendVerificationEmailUseCase";

export class ResendVerificationEmailController {
  async handle(request: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(ResendVerificationEmailUseCase);
    const result = await useCase.execute(request.user!.id);
    return reply.status(200).send({ success: true, ...result });
  }
}
