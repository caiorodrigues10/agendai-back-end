import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { ListBarbershopsUseCase } from "./ListBarbershopsUseCase";

export class ListBarbershopsController {
  async handle(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const useCase = container.resolve(ListBarbershopsUseCase);
    const list = await useCase.execute();
    reply.send({ success: true, data: list });
  }
}
