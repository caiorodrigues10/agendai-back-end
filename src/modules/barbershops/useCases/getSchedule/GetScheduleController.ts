import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { GetScheduleUseCase } from "./GetScheduleUseCase";

export class GetScheduleController {
  async handle(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = request.params as { id: string };
    const useCase = container.resolve(GetScheduleUseCase);
    const schedule = await useCase.execute(id);
    reply.send({ success: true, data: schedule });
  }
}
