import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { GetServiceUseCase } from "./GetServiceUseCase";

export class GetServiceController {
  async handle(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = request.params as { id: string };
    const useCase = container.resolve(GetServiceUseCase);
    const service = await useCase.execute(id);
    reply.send({ success: true, data: service });
  }
}
