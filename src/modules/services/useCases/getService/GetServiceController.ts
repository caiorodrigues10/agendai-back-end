import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { GetServiceUseCase } from "./GetServiceUseCase";
import { AppError } from "@/shared/errors/AppError";

export class GetServiceController {
  async handle(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = request.params as { id: string };
    const { barbershopId } = request.query as { barbershopId?: string };
    if (!barbershopId) throw new AppError("barbershopId é obrigatório", 400);
    const useCase = container.resolve(GetServiceUseCase);
    const service = await useCase.execute(id, barbershopId);
    reply.send({ success: true, data: service });
  }
}
