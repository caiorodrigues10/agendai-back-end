import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { DeleteServiceUseCase } from "./DeleteServiceUseCase";

export class DeleteServiceController {
  async handle(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = request.params as { id: string };
    const useCase = container.resolve(DeleteServiceUseCase);
    await useCase.execute(id);
    reply.status(204).send();
  }
}
