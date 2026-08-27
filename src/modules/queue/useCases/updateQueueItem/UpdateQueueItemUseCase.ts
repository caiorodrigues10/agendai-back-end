import { inject, injectable } from "tsyringe";
import { AppError } from "@/shared/errors/AppError";
import { IQueueRepository } from "../../repositories/IQueueRepository";
import { NotifyQueuePositionUpdatesUseCase } from "../notifyQueuePositionUpdates/NotifyQueuePositionUpdatesUseCase";
import {
  assertQueueStatusTransition,
  assertQueueTenantAccess,
  parseQueueStatus,
  type QueueRequestingUser,
} from "../../utils/queueAccess";
import { computeInsertJoinedAt } from "../../utils/computeInsertJoinedAt";

@injectable()
export class UpdateQueueItemUseCase {
  constructor(
    @inject("QueueRepository")
    private queueRepository: IQueueRepository,
    @inject(NotifyQueuePositionUpdatesUseCase)
    private notifyQueuePositionUpdates: NotifyQueuePositionUpdatesUseCase
  ) {}

  async execute(
    id: string,
    statusRaw: string,
    requestingUser: QueueRequestingUser,
    details?: { completedBy?: string; finalPrice?: number; insertAt?: number }
  ) {
    const item = await this.queueRepository.findById(id);
    if (!item) throw new AppError("Item de fila não encontrado", 404);

    assertQueueTenantAccess(item.barbershopId, requestingUser);

    const nextStatus = parseQueueStatus(statusRaw);
    assertQueueStatusTransition(item.status, nextStatus);

    let joinedAt: Date | undefined;
    if (nextStatus === "waiting") {
      const waiting = (await this.queueRepository.findWaitingByBarbershop(item.barbershopId)).filter(
        (w) => w.id !== id
      );
      const insertAt = details?.insertAt ?? waiting.length;
      joinedAt = computeInsertJoinedAt(
        waiting.map((w) => w.joinedAt),
        insertAt
      );
    }

    const updated = await this.queueRepository.updateStatus(id, nextStatus, {
      ...details,
      joinedAt,
    });

    try {
      await this.notifyQueuePositionUpdates.execute(item.barbershopId);
    } catch {
      // notificação não bloqueia a mutação
    }
    return updated;
  }
}
