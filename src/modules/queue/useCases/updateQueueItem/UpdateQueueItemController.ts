import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { AppError } from "@/shared/errors/AppError";
import { updateQueueItemSchema } from "../../schemas/queueSchemas";
import { UpdateQueueItemUseCase } from "./UpdateQueueItemUseCase";

export class UpdateQueueItemController {
  async handle(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user;
    if (!user) {
      throw new AppError("Não autenticado", 401);
    }

    const { id } = request.params as { id: string };
    const parsed = updateQueueItemSchema.parse(request.body);
    const { status, completedBy, finalPrice } = parsed;

    const useCase = container.resolve(UpdateQueueItemUseCase);
    const item = await useCase.execute(id, status, user, {
      completedBy,
      finalPrice,
    });
    return reply.status(200).send(item);
  }
}
