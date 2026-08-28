import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { GetBarbershopUseCase } from "./GetBarbershopUseCase";
import { ListPublicStaffUseCase } from "./ListPublicStaffUseCase";
import { toPublicBarbershop } from "../../utils/shopEvolutionInstance";

export class GetBarbershopController {
  async handle(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = request.params as { id: string };
    const useCase = container.resolve(GetBarbershopUseCase);
    const entity = await useCase.execute(id);
    reply.send({ success: true, data: toPublicBarbershop(entity) });
  }

  /** Nomes da equipe para a agenda pública (sem e-mail). */
  async listStaff(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = request.params as { id: string };
    const useCase = container.resolve(ListPublicStaffUseCase);
    const data = await useCase.execute(id);
    reply.send({ success: true, data });
  }
}
