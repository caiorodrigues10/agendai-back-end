import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { AppError } from "@/shared/errors/AppError";
import { UpdateQueueItemUseCase } from "./UpdateQueueItemUseCase";

export class UpdateQueueItemController {
  async handle(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user;
    if (!user) {
      throw new AppError("Não autenticado", 401);
    }

    const { id } = request.params as { id: string };
    const { status, completedBy, finalPrice } = request.body as {
      status: string;
      completedBy?: string;
      finalPrice?: number;
    };

    const useCase = container.resolve(UpdateQueueItemUseCase);
    const item = await useCase.execute(id, status, user, {
      completedBy,
      finalPrice,
    });
    return reply.status(200).send(item);
  }
}
