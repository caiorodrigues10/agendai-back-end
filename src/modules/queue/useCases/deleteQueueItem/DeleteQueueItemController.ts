import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { DeleteQueueItemUseCase } from "./DeleteQueueItemUseCase";

export class DeleteQueueItemController {
  async handle(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const useCase = container.resolve(DeleteQueueItemUseCase);
    await useCase.execute(id);
    return reply.status(204).send();
  }
}
