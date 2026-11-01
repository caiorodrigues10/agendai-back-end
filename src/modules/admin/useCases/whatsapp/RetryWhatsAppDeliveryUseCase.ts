import { AppError } from "@/shared/errors/AppError";
import { IPlatformWhatsAppSettingsRepository } from "../../repositories/IPlatformWhatsAppSettingsRepository";
import { IAdminWhatsAppNotificationRepository } from "../../repositories/IAdminWhatsAppNotificationRepository";

const NOT_RETRYABLE = [
  "DELIVERED",
  "SENT",
  "READ",
  "QUEUED",
  "PUBLISHING",
  "PROCESSING",
];
const TERMINAL = ["SUPPRESSED", "COMPLAINED", "BOUNCED"];

export interface RetryWhatsAppDeliveryInput {
  id: string;
  reason: string;
  userId: string;
  ipAddress?: string;
}

export class RetryWhatsAppDeliveryUseCase {
  constructor(
    private readonly repo: IAdminWhatsAppNotificationRepository,
    private readonly settingsRepo: IPlatformWhatsAppSettingsRepository
  ) {}

  async execute(input: RetryWhatsAppDeliveryInput) {
    const settings = await this.settingsRepo.get();
    if (settings.outboundPaused) {
      throw new AppError("Envios de WhatsApp pausados globalmente", 409);
    }

    const delivery = await this.repo.findDelivery(input.id);
    if (!delivery) throw new AppError("Entrega não encontrada", 404);
    if (delivery.channel !== "WHATSAPP") {
      throw new AppError("Entrega não é WhatsApp", 400);
    }
    if (NOT_RETRYABLE.includes(delivery.status)) {
      throw new AppError("Entrega não está em estado reenviável", 409);
    }
    if (TERMINAL.includes(delivery.status)) {
      throw new AppError("Entrega não reenviável (suprimida/reclamada/rejeitada)", 409);
    }

    const suppressed = await this.repo.findActiveSuppression({
      channel: "WHATSAPP",
      destinationHash: delivery.destinationHash,
    });
    if (suppressed) throw new AppError("Destinatário suprimido", 409);

    if (delivery.barbershopId) {
      const disabledPref = await this.repo.findDisabledPreference({
        barbershopId: delivery.barbershopId,
        channel: "WHATSAPP",
        type: delivery.type,
      });
      if (disabledPref) throw new AppError("Preferência de WhatsApp desligada", 409);
    }

    await this.repo.markDeliveryForRetry({
      id: delivery.id,
      reason: input.reason,
      userId: input.userId,
      ipAddress: input.ipAddress,
      barbershopId: delivery.barbershopId ?? undefined,
    });

    return { id: delivery.id, retried: true };
  }
}
