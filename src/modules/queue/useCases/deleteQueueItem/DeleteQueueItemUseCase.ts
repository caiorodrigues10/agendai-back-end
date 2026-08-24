import { inject, injectable } from "tsyringe";
import { AppError } from "@/shared/errors/AppError";
import { IQueueRepository } from "../../repositories/IQueueRepository";
import { NotifyQueuePositionUpdatesUseCase } from "../notifyQueuePositionUpdates/NotifyQueuePositionUpdatesUseCase";
import {
  assertQueueTenantAccess,
  type QueueRequestingUser,
} from "../../utils/queueAccess";

@injectable()
export class DeleteQueueItemUseCase {
  constructor(
    @inject("QueueRepository")
    private queueRepository: IQueueRepository,
    @inject(NotifyQueuePositionUpdatesUseCase)
    private notifyQueuePositionUpdates: NotifyQueuePositionUpdatesUseCase
  ) {}

  async execute(id: string, requestingUser: QueueRequestingUser): Promise<void> {
    const item = await this.queueRepository.findById(id);
    if (!item) throw new AppError("Item de fila não encontrado", 404);

    assertQueueTenantAccess(item.barbershopId, requestingUser);

    await this.queueRepository.delete(id);
    try {
      await this.notifyQueuePositionUpdates.execute(item.barbershopId);
    } catch {
      // notificação não bloqueia a remoção
    }
  }
}
