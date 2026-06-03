import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { UpdateQueueItemUseCase } from "./UpdateQueueItemUseCase";

export class UpdateQueueItemController {
  async handle(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const { status, ...details } = request.body as { status: string, [key: string]: any };
    
    const useCase = container.resolve(UpdateQueueItemUseCase);
    const item = await useCase.execute(id, status, details);
    return reply.status(200).send(item);
  }
}
