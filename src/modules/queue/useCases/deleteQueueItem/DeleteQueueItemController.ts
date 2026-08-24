import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { AppError } from "@/shared/errors/AppError";
import { DeleteQueueItemUseCase } from "./DeleteQueueItemUseCase";

export class DeleteQueueItemController {
  async handle(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user;
    if (!user) {
      throw new AppError("Não autenticado", 401);
    }

    const { id } = request.params as { id: string };
    const useCase = container.resolve(DeleteQueueItemUseCase);
    await useCase.execute(id, user);
    return reply.status(204).send();
  }
}
