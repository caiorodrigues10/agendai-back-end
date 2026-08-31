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
    details?: { completedBy?: string; finalPrice?: number; paymentMethod?: string; insertAt?: number; commissionSplits?: { professionalId: string; percentage: number }[] }
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

    if (nextStatus === "completed" && details?.commissionSplits) {
      const service = await (await import("@/libs/prismaClient")).prisma.service.findUnique({
        where: { id: item.serviceId },
        select: { commissionPercent: true },
      });
      const total = details.commissionSplits.reduce((sum, split) => sum + split.percentage, 0);
      const expected = service?.commissionPercent ?? 0;
      if (Math.abs(total - expected) > 0.01) {
        throw new AppError(`A divisão deve totalizar ${expected}% de comissão`, 400);
      }
      const ids = details.commissionSplits.map((split) => split.professionalId);
      const professionals = await (await import("@/libs/prismaClient")).prisma.user.findMany({
        where: { id: { in: ids }, barbershopId: item.barbershopId, active: true },
        select: { id: true },
      });
      if (professionals.length !== new Set(ids).size) {
        throw new AppError("Uma das profissionais não pertence a este salão", 400);
      }
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

    if (nextStatus === "completed" && details?.commissionSplits?.length && details.finalPrice != null) {
      const prisma = (await import("@/libs/prismaClient")).prisma;
      await prisma.commissionEntry.createMany({
        data: details.commissionSplits.map((split) => ({
          barbershopId: item.barbershopId,
          queueItemId: item.id,
          serviceId: item.serviceId,
          professionalId: split.professionalId,
          percentage: split.percentage,
          amount: Math.round(details.finalPrice! * split.percentage) / 100,
        })),
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
