import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { AppError } from "@/shared/errors/AppError";
import { updateQueueItemSchema } from "../../schemas/queueSchemas";
import { UpdateQueueItemUseCase } from "./UpdateQueueItemUseCase";
import { notifyQueueCapacity } from "../../services/queueCapacityAlert";

export class UpdateQueueItemController {
  async handle(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user;
    if (!user) {
      throw new AppError("Não autenticado", 401);
    }

    const { id } = request.params as { id: string };
    const { status, completedBy, finalPrice, paymentMethod, insertAt, commissionSplits, retailSale } = updateQueueItemSchema.parse(request.body);

    const useCase = container.resolve(UpdateQueueItemUseCase);
    const item = await useCase.execute(id, status, user, {
      completedBy,
      finalPrice,
      paymentMethod,
      insertAt,
      commissionSplits,
      retailSale,
    });
    if (status.toLowerCase() === "waiting") {
      try { await notifyQueueCapacity(item.barbershopId, item.id, item.customerName); } catch { /* alerta não bloqueia a operação */ }
    }
    return reply.status(200).send(item);
  }
}
