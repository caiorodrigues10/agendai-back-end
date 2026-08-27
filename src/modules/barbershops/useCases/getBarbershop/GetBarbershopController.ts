import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { GetBarbershopUseCase } from "./GetBarbershopUseCase";
import { toPublicBarbershop } from "../../utils/shopEvolutionInstance";

export class GetBarbershopController {
  async handle(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = request.params as { id: string };
    const useCase = container.resolve(GetBarbershopUseCase);
    const entity = await useCase.execute(id);
    reply.send({ success: true, data: toPublicBarbershop(entity) });
  }
}
