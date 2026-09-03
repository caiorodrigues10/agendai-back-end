import { inject, injectable } from "tsyringe";
import { AppError } from "@/shared/errors/AppError";
import { IQueueRepository } from "../../repositories/IQueueRepository";
import { IBarbershopRepository } from "@/modules/barbershops/repositories/IBarbershopRepository";
import { IServiceRepository } from "@/modules/services/repositories/IServiceRepository";
import { IUserRepository } from "@/modules/users/repositories/IUserRepository";
import { ICommissionRepository } from "@/modules/commissions/repositories/ICommissionRepository";
import { NotifyQueuePositionUpdatesUseCase, buildQueueCalledMessage, buildQueueCancelledMessage } from "../notifyQueuePositionUpdates/NotifyQueuePositionUpdatesUseCase";
import { assertQueueStatusTransition, assertQueueTenantAccess, parseQueueStatus, type QueueRequestingUser } from "../../utils/queueAccess";
import { computeInsertJoinedAt } from "../../utils/computeInsertJoinedAt";
import { isPlaceholderWhatsApp } from "../../utils/queueDuplicate";
import { enqueueWhatsApp } from "@/shared/infra/queue";
import { ISalonClientRepository } from "@/modules/clients/repositories/ISalonClientRepository";
import { publishRealtime } from "@/shared/services/realtimeService";
import { IFiadoRepository } from "@/modules/fiado/repositories/IFiadoRepository";
import { recordFiadoCreated, recordQueueCompletion } from "@/modules/crm/services/crmLedger";
import { ProductCatalogUseCase } from "@/modules/products/useCases/productUseCases";
import type { z } from "zod";
import type { retailSalePayloadSchema } from "@/modules/products/schemas/productSchemas";

type CommissionSplit = { professionalId: string; percentage: number };
type RetailSalePayload = z.infer<typeof retailSalePayloadSchema>;

@injectable()
export class UpdateQueueItemUseCase {
  constructor(
    @inject("QueueRepository") private queueRepository: IQueueRepository,
    @inject(NotifyQueuePositionUpdatesUseCase) private notifyQueuePositionUpdates: NotifyQueuePositionUpdatesUseCase,
    @inject("BarbershopRepository") private barbershopRepository: IBarbershopRepository,
    @inject("SalonClientRepository") private salonClients?: ISalonClientRepository,
    @inject("FiadoRepository") private fiadoRepository?: IFiadoRepository,
    @inject("ServiceRepository") private serviceRepository?: IServiceRepository,
    @inject("UserRepository") private userRepository?: IUserRepository,
    @inject("CommissionRepository") private commissionRepository?: ICommissionRepository,
    @inject(ProductCatalogUseCase) private productCatalog?: ProductCatalogUseCase,
  ) {}

  async execute(id: string, statusRaw: string, requestingUser: QueueRequestingUser, details?: {
    completedBy?: string; finalPrice?: number; paymentMethod?: string; insertAt?: number; commissionSplits?: CommissionSplit[]; retailSale?: RetailSalePayload;
  }) {
    const item = await this.queueRepository.findById(id);
    if (!item) throw new AppError("Item de fila nao encontrado", 404);
    assertQueueTenantAccess(item.barbershopId, requestingUser);
    const nextStatus = parseQueueStatus(statusRaw);
    if (item.status === "completed" && nextStatus === "completed" && details?.retailSale) {
      await this.attachRetailSale(item, requestingUser, details.retailSale);
      publishRealtime(item.barbershopId, "queue:changed");
      return item;
    }
    assertQueueStatusTransition(item.status, nextStatus);
    const service = nextStatus === "completed"
      ? await this.serviceRepository?.findById(item.serviceId, item.barbershopId)
      : null;
    const completionPrice = details?.finalPrice ?? service?.price ?? item.finalPrice ?? 0;
    const isFiadoCompletion = nextStatus === "completed" && details?.paymentMethod === "fiado";
    if (isFiadoCompletion && completionPrice <= 0) {
      throw new AppError("Informe um valor maior que zero para registrar o fiado", 400);
    }

    let commissionSplits = details?.commissionSplits;
    if (nextStatus === "completed" && commissionSplits === undefined) {
      const expected = service?.commissionPercent ?? 0;
      if (expected > 0) commissionSplits = [{ professionalId: requestingUser.id, percentage: expected }];
    }
    if (nextStatus === "completed" && commissionSplits) {
      const expected = service?.commissionPercent ?? 0;
      const total = commissionSplits.reduce((sum, split) => sum + split.percentage, 0);
      if (Math.abs(total - expected) > 0.01) throw new AppError(`A divisao deve totalizar ${expected}% de comissao`, 400);
      const ids = commissionSplits.map((split) => split.professionalId);
      if (new Set(ids).size !== ids.length) throw new AppError("Cada profissional so pode aparecer uma vez na divisao", 400);
      const professionals = await this.userRepository?.listActiveByBarbershop(item.barbershopId, ids) ?? [];
      if (professionals.length !== ids.length) throw new AppError("Um dos profissionais nao pertence a este salao", 400);
      if (completionPrice < 0) throw new AppError("Informe o valor final recebido para calcular a comissao", 400);
      if (await this.commissionRepository?.hasEntriesForQueueItem(item.id)) throw new AppError("Este atendimento ja possui comissao lancada", 409);
    }

    let joinedAt: Date | undefined;
    if (nextStatus === "waiting") {
      const waiting = (await this.queueRepository.findWaitingByBarbershop(item.barbershopId)).filter((w) => w.id !== id);
      joinedAt = computeInsertJoinedAt(waiting.map((w) => w.joinedAt), details?.insertAt ?? waiting.length);
    }

    let updated;
    if (nextStatus === "completed" && commissionSplits?.length) {
      try {
        updated = await this.queueRepository.completeWithCommissions(id, {
          completedBy: requestingUser.id, finalPrice: completionPrice,
          paymentMethod: details?.paymentMethod, splits: commissionSplits,
        });
      } catch (error) {
        if (error instanceof Error && error.message === "QUEUE_ITEM_ALREADY_COMPLETED") throw new AppError("Este atendimento ja foi finalizado", 409);
        throw error;
      }
    } else {
      updated = await this.queueRepository.updateStatus(id, nextStatus, {
        ...details,
        ...(nextStatus === "completed" ? { finalPrice: completionPrice } : {}),
        joinedAt,
      });
    }

    if (isFiadoCompletion) {
      let clientId = item.clientId ?? null;
      if (!clientId) {
        const client = await this.salonClients?.upsertFromVisit(item.barbershopId, item.customerName, item.whatsapp);
        clientId = client?.id ?? null;
        if (clientId) await this.queueRepository.assignClient(updated.id, clientId);
      }
      const fiado = await this.fiadoRepository?.create({ barbershopId: item.barbershopId, customerName: item.customerName, whatsapp: item.whatsapp, clientId,
        description: item.serviceName || "Atendimento na fila", amount: completionPrice,
        notes: `Gerado automaticamente ao finalizar o atendimento da fila (${item.id}).`, createdById: details?.completedBy || requestingUser.id, origin: "SERVICE_COMPLETION" });
      if (fiado) await recordFiadoCreated(fiado.id);
    }
    if (nextStatus === "completed" || nextStatus === "waiting") {
      try {
        const client = await this.salonClients?.upsertFromVisit(item.barbershopId, item.customerName, item.whatsapp);
        if (client) await this.queueRepository.assignClient(updated.id, client.id);
      } catch { /* CRM nao bloqueia */ }
    }
    if (nextStatus === "completed") await recordQueueCompletion(updated.id);
    if (nextStatus === "completed" && details?.retailSale) {
      await this.attachRetailSale(updated, requestingUser, details.retailSale);
    }
    const shouldNotifyCustomer = !isPlaceholderWhatsApp(item.whatsapp) && ((item.status === "waiting" && nextStatus === "in_chair") || nextStatus === "cancelled");
    if (shouldNotifyCustomer) {
      try {
        const shop = await this.barbershopRepository.findById(item.barbershopId);
        const instanceName = shop?.evolutionInstanceName?.trim();
        if (instanceName) {
          const called = item.status === "waiting" && nextStatus === "in_chair";
          await enqueueWhatsApp({
            phone: item.whatsapp,
            message: called
              ? buildQueueCalledMessage(item.customerName, shop?.name?.trim() || "a barbearia")
              : buildQueueCancelledMessage(item.customerName, shop?.name?.trim() || "a barbearia"),
            instanceName,
            deduplicationKey: called ? `call:${item.id}` : `cancel:${item.id}`,
            notificationType: called ? "QUEUE_CALLED" : "QUEUE_CANCELED",
            barbershopId: item.barbershopId,
            clientId: item.clientId ?? undefined,
            sourceType: "QUEUE_ITEM",
            sourceId: item.id,
          });
        }
      } catch { /* notificacao nao bloqueia */ }
    }
    try { await this.notifyQueuePositionUpdates.execute(item.barbershopId); } catch { /* notificacao nao bloqueia */ }
    publishRealtime(item.barbershopId, "queue:changed");
    return updated;
  }

  private async attachRetailSale(
    item: { id: string; barbershopId: string; clientId?: string | null; customerName: string; whatsapp: string },
    requestingUser: QueueRequestingUser,
    retailSale: RetailSalePayload,
  ) {
    if (!this.productCatalog) return;
    let clientId = retailSale.clientId ?? item.clientId ?? null;
    if (!clientId && (retailSale.paymentMethod === "fiado" || item.customerName)) {
      try {
        const client = await this.salonClients?.upsertFromVisit(item.barbershopId, item.customerName, item.whatsapp);
        clientId = client?.id ?? clientId;
        if (clientId) await this.queueRepository.assignClient(item.id, clientId);
      } catch { /* CRM nao bloqueia a venda */ }
    }
    await this.productCatalog.createSale(item.barbershopId, requestingUser, {
      paymentMethod: retailSale.paymentMethod,
      items: retailSale.items,
      discount: retailSale.discount,
      clientId,
      queueItemId: item.id,
      idempotencyKey: retailSale.idempotencyKey ?? `queue:${item.id}`,
      customerName: item.customerName,
      whatsapp: item.whatsapp,
    });
  }
}
