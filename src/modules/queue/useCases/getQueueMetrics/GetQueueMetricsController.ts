import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { GetQueueMetricsUseCase } from "./GetQueueMetricsUseCase";

export class GetQueueMetricsController {
  async handle(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { barbershopId } = request.query as { barbershopId?: string };
    const getQueueMetricsUseCase = container.resolve(GetQueueMetricsUseCase);
    const metrics = await getQueueMetricsUseCase.execute(barbershopId);
    return reply.status(200).send(metrics);
  }
}
