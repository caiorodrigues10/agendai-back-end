import { IAdminWhatsAppNotificationRepository } from "../../repositories/IAdminWhatsAppNotificationRepository";
import { IPlatformWhatsAppSettingsRepository } from "../../repositories/IPlatformWhatsAppSettingsRepository";

const TERMINAL_REASONS: Record<string, string> = {
  SUPPRESSED: "Destinatário suprimido",
  COMPLAINED: "Reclamação do destinatário",
  BOUNCED: "Envios rejeitados pelo destinatário",
};

const NOT_RETRYABLE = ["DELIVERED", "SENT", "READ", "QUEUED", "PUBLISHING", "PROCESSING"];

export interface FailedWhatsAppDeliveryView {
  id: string;
  barbershopId: string | null;
  channel: string;
  type: string;
  status: string;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: Date;
  retryable: boolean;
  notRetryableReason?: string;
}

export interface FailedWhatsAppOutboxView {
  id: string;
  deliveryId: string | null;
  status: string;
  lastError: string | null;
  publishAttempts: number;
  createdAt: Date;
  retryable: boolean;
  notRetryableReason?: string;
}

/**
 * Lista as falhas de envio calculando, para cada item, se o reenvio é
 * possível — com a mesma regra aplicada por `RetryWhatsAppDeliveryUseCase` /
 * `RetryWhatsAppOutboxUseCase`. Assim a UI nunca oferece o que a API recusa.
 */
export class ListFailedWhatsAppNotificationsUseCase {
  constructor(
    private readonly repo: IAdminWhatsAppNotificationRepository,
    private readonly settingsRepo: IPlatformWhatsAppSettingsRepository
  ) {}

  async execute(): Promise<{
    deliveries: FailedWhatsAppDeliveryView[];
    outbox: FailedWhatsAppOutboxView[];
  }> {
    const [settings, { deliveries, outbox }] = await Promise.all([
      this.settingsRepo.get(),
      this.repo.listFailed(),
    ]);

    const suppressedHashes = new Set(
      await this.repo.findActiveSuppressions({
        channel: "WHATSAPP",
        destinationHashes: deliveries.map((delivery) => delivery.destinationHash),
      })
    );

    const preferencePairs = deliveries
      .filter((delivery) => delivery.barbershopId)
      .map((delivery) => ({
        barbershopId: delivery.barbershopId as string,
        type: delivery.type,
      }));
    const disabledPreferences = new Set(
      await this.repo.findDisabledPreferences({ channel: "WHATSAPP", pairs: preferencePairs })
    );

    const deliveryViews: FailedWhatsAppDeliveryView[] = deliveries.map((delivery) => {
      const reason = this.deliveryBlockReason({
        status: delivery.status,
        paused: settings.outboundPaused,
        suppressed: suppressedHashes.has(delivery.destinationHash),
        preferenceDisabled:
          Boolean(delivery.barbershopId) &&
          disabledPreferences.has(`${delivery.barbershopId}:${delivery.type}`),
      });
      return {
        id: delivery.id,
        barbershopId: delivery.barbershopId,
        channel: delivery.channel,
        type: delivery.type,
        status: delivery.status,
        errorCode: delivery.errorCode,
        errorMessage: delivery.errorMessage,
        createdAt: delivery.createdAt,
        retryable: !reason,
        ...(reason ? { notRetryableReason: reason } : {}),
      };
    });

    const outboxViews: FailedWhatsAppOutboxView[] = outbox.map((row) => {
      const reason = this.outboxBlockReason({
        paused: settings.outboundPaused,
        deliveryStatus: row.delivery?.status ?? null,
      });
      return {
        id: row.id,
        deliveryId: row.deliveryId,
        status: row.status,
        lastError: row.lastError,
        publishAttempts: row.publishAttempts,
        createdAt: row.createdAt,
        retryable: !reason,
        ...(reason ? { notRetryableReason: reason } : {}),
      };
    });

    return { deliveries: deliveryViews, outbox: outboxViews };
  }

  private deliveryBlockReason(input: {
    status: string;
    paused: boolean;
    suppressed: boolean;
    preferenceDisabled: boolean;
  }): string | null {
    if (input.paused) return "Envios pausados globalmente";
    if (TERMINAL_REASONS[input.status]) return TERMINAL_REASONS[input.status];
    if (NOT_RETRYABLE.includes(input.status)) return "Entrega não está em estado reenviável";
    if (input.suppressed) return "Destinatário suprimido";
    if (input.preferenceDisabled) return "Preferência de WhatsApp desligada";
    return null;
  }

  private outboxBlockReason(input: {
    paused: boolean;
    deliveryStatus: string | null;
  }): string | null {
    if (input.paused) return "Envios pausados globalmente";
    if (input.deliveryStatus && NOT_RETRYABLE.includes(input.deliveryStatus)) {
      return "Entrega não está em estado reenviável";
    }
    return null;
  }
}
