import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { DeleteBarbershopUseCase } from "./DeleteBarbershopUseCase";

export class DeleteBarbershopController {
  async handle(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = request.params as { id: string };
    const useCase = container.resolve(DeleteBarbershopUseCase);
    await useCase.execute(id);
    reply.status(204).send();
  }
}
