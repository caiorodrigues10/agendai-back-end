import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { ListQueueUseCase } from "./ListQueueUseCase";

export class ListQueueController {
  async handle(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { barbershopId } = request.query as { barbershopId?: string };
    const listQueueUseCase = container.resolve(ListQueueUseCase);
    const queue = await listQueueUseCase.execute(barbershopId);
    return reply.status(200).send(queue);
  }
}
