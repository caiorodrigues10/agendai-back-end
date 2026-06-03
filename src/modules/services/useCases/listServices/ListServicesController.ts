import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { ListServicesUseCase } from "./ListServicesUseCase";

export class ListServicesController {
  async handle(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const barbershopId = (request.query as { barbershopId?: string }).barbershopId;
    const useCase = container.resolve(ListServicesUseCase);
    const list = await useCase.execute(barbershopId);
    reply.send({ success: true, data: list });
  }
}
