import { AppError } from "@/shared/errors/AppError";
import { IPlatformWhatsAppSettingsRepository } from "../../repositories/IPlatformWhatsAppSettingsRepository";
import { IAdminWhatsAppNotificationRepository } from "../../repositories/IAdminWhatsAppNotificationRepository";

const NOT_RETRYABLE = ["DELIVERED", "SENT", "READ", "QUEUED", "PROCESSING"];

export interface RetryWhatsAppOutboxInput {
  id: string;
  reason: string;
  userId: string;
  ipAddress?: string;
}

export class RetryWhatsAppOutboxUseCase {
  constructor(
    private readonly repo: IAdminWhatsAppNotificationRepository,
    private readonly settingsRepo: IPlatformWhatsAppSettingsRepository
  ) {}

  async execute(input: RetryWhatsAppOutboxInput) {
    const settings = await this.settingsRepo.get();
    if (settings.outboundPaused) {
      throw new AppError("Envios de WhatsApp pausados globalmente", 409);
    }

    const row = await this.repo.findOutbox(input.id);
    if (!row) throw new AppError("Outbox não encontrado", 404);
    if (row.delivery?.status && NOT_RETRYABLE.includes(row.delivery.status)) {
      throw new AppError("Entrega não está em estado reenviável", 409);
    }

    await this.repo.markOutboxForRetry({
      id: row.id,
      deliveryId: row.deliveryId,
      reason: input.reason,
      userId: input.userId,
      ipAddress: input.ipAddress,
      barbershopId: row.delivery?.barbershopId ?? undefined,
    });

    return { id: row.id, retried: true };
  }
}
