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
import { ISalonClientRepository } from "@/modules/clients/repositories/ISalonClientRepository";
import { IFiadoRepository } from "@/modules/fiado/repositories/IFiadoRepository";

@injectable()
export class UpdateQueueItemUseCase {
  constructor(
    @inject("QueueRepository")
    private queueRepository: IQueueRepository,
    @inject(NotifyQueuePositionUpdatesUseCase)
    private notifyQueuePositionUpdates: NotifyQueuePositionUpdatesUseCase,
    @inject("BarbershopRepository")
    private barbershopRepository: IBarbershopRepository,
    @inject("SalonClientRepository")
    private salonClients?: ISalonClientRepository,
    @inject("FiadoRepository")
    private fiadoRepository?: IFiadoRepository
  ) {}

  async execute(
    id: string,
    statusRaw: string,
    requestingUser: QueueRequestingUser,
    details?: { completedBy?: string; finalPrice?: number; paymentMethod?: string; insertAt?: number }
  ) {
    const item = await this.queueRepository.findById(id);
    if (!item) throw new AppError("Item de fila não encontrado", 404);

    assertQueueTenantAccess(item.barbershopId, requestingUser);

    const nextStatus = parseQueueStatus(statusRaw);
    assertQueueStatusTransition(item.status, nextStatus);

    const isFiadoCompletion = nextStatus === "completed" && details?.paymentMethod === "fiado";
    if (isFiadoCompletion && (!details?.finalPrice || details.finalPrice <= 0)) {
      throw new AppError("Informe um valor maior que zero para registrar o fiado", 400);
    }

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

    if (isFiadoCompletion) {
      await this.fiadoRepository?.create({
        barbershopId: item.barbershopId,
        customerName: item.customerName,
        whatsapp: item.whatsapp,
        description: item.serviceName || "Atendimento na fila",
        amount: details!.finalPrice!,
        notes: `Gerado automaticamente ao finalizar o atendimento da fila (${item.id}).`,
        createdById: details?.completedBy || requestingUser.id,
      });
    }

    if (nextStatus === "completed" || nextStatus === "waiting") {
      try {
        await this.salonClients?.upsertFromVisit(
          item.barbershopId,
          item.customerName,
          item.whatsapp
        );
      } catch {
        // CRM não bloqueia a mutação
      }
    }

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
