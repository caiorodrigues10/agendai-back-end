import { inject, injectable } from "tsyringe";
import { AppError } from "@/shared/errors/AppError";
import { IQueueRepository } from "../../repositories/IQueueRepository";
import { IBarbershopRepository } from "@/modules/barbershops/repositories/IBarbershopRepository";
import {
  NotifyQueuePositionUpdatesUseCase,
  buildQueueCalledMessage,
  buildQueueCancelledMessage,
} from "../notifyQueuePositionUpdates/NotifyQueuePositionUpdatesUseCase";
import {
  assertQueueStatusTransition,
  assertQueueTenantAccess,
  parseQueueStatus,
  type QueueRequestingUser,
} from "../../utils/queueAccess";
import { computeInsertJoinedAt } from "../../utils/computeInsertJoinedAt";
import { isPlaceholderWhatsApp } from "../../utils/queueDuplicate";
import { enqueueWhatsApp } from "@/shared/infra/queue";

@injectable()
export class UpdateQueueItemUseCase {
  constructor(
    @inject("QueueRepository")
    private queueRepository: IQueueRepository,
    @inject(NotifyQueuePositionUpdatesUseCase)
    private notifyQueuePositionUpdates: NotifyQueuePositionUpdatesUseCase,
    @inject("BarbershopRepository")
    private barbershopRepository: IBarbershopRepository
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

    const shouldNotifyCustomer =
      !isPlaceholderWhatsApp(item.whatsapp) &&
      ((item.status === "waiting" && nextStatus === "in_chair") || nextStatus === "cancelled");

    if (shouldNotifyCustomer) {
      try {
        const shop = await this.barbershopRepository.findById(item.barbershopId);
        const shopLabel = shop?.name?.trim() || "a barbearia";
        const instanceName = shop?.evolutionInstanceName?.trim();
        if (instanceName) {
          const called = item.status === "waiting" && nextStatus === "in_chair";
          await enqueueWhatsApp({
            phone: item.whatsapp,
            message: called
              ? buildQueueCalledMessage(item.customerName, shopLabel)
              : buildQueueCancelledMessage(item.customerName, shopLabel),
            instanceName,
            deduplicationKey: called ? `call:${item.id}` : `cancel:${item.id}`,
          });
        }
      } catch {
        // notificação não bloqueia a mutação
      }
    }

    try {
      await this.notifyQueuePositionUpdates.execute(item.barbershopId);
    } catch {
      // notificação não bloqueia a mutação
    }
    return updated;
  }
}
