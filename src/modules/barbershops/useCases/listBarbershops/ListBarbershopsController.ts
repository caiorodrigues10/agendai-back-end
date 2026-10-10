import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { ListBarbershopsUseCase, ListBarbershopsOptions } from "./ListBarbershopsUseCase";
import { toPublicBarbershop } from "../../utils/shopEvolutionInstance";

export class ListBarbershopsController {
  async handle(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const useCase = container.resolve(ListBarbershopsUseCase);
    const { limit, offset } = (request.query ?? {}) as ListBarbershopsOptions;
    const list = await useCase.execute({ limit, offset });
    reply.send({ success: true, data: list.map(toPublicBarbershop) });
  }
}
