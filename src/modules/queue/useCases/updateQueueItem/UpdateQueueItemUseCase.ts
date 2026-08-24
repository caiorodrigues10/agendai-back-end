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
    details?: { completedBy?: string; finalPrice?: number }
  ) {
    const item = await this.queueRepository.findById(id);
    if (!item) throw new AppError("Item de fila não encontrado", 404);

    assertQueueTenantAccess(item.barbershopId, requestingUser);

    const nextStatus = parseQueueStatus(statusRaw);
    assertQueueStatusTransition(item.status, nextStatus);

    const updated = await this.queueRepository.updateStatus(
      id,
      nextStatus,
      details
    );

    try {
      await this.notifyQueuePositionUpdates.execute(item.barbershopId);
    } catch {
      // notificação não bloqueia a mutação
    }
    return updated;
  }
}
