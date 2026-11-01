export interface RetryableNotificationDelivery {
  id: string;
  channel: string;
  status: string;
  destinationHash: string;
  barbershopId: string | null;
  type: string;
}

export interface RetryableNotificationOutbox {
  id: string;
  deliveryId: string | null;
  delivery: { status: string; barbershopId: string | null } | null;
}

export interface RetryAuditInput {
  id: string;
  reason: string;
  userId: string;
  ipAddress?: string;
  barbershopId?: string;
}

/** Entrega com falha — `destinationHash` é interno e nunca vai para a API. */
export interface FailedWhatsAppDelivery {
  id: string;
  barbershopId: string | null;
  channel: string;
  type: string;
  status: string;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: Date;
  destinationHash: string;
}

export interface FailedWhatsAppOutbox {
  id: string;
  deliveryId: string | null;
  status: string;
  lastError: string | null;
  publishAttempts: number;
  createdAt: Date;
  delivery: { status: string } | null;
}

export interface NotificationPreferenceKey {
  barbershopId: string;
  type: string;
}

export interface IAdminWhatsAppNotificationRepository {
  listFailed(): Promise<{ deliveries: FailedWhatsAppDelivery[]; outbox: FailedWhatsAppOutbox[] }>;
  findDelivery(id: string): Promise<RetryableNotificationDelivery | null>;
  findOutbox(id: string): Promise<RetryableNotificationOutbox | null>;
  findActiveSuppression(input: {
    channel: string;
    destinationHash: string;
  }): Promise<{ id: string } | null>;
  findActiveSuppressions(input: {
    channel: string;
    destinationHashes: string[];
  }): Promise<string[]>;
  findDisabledPreference(input: {
    barbershopId: string;
    channel: string;
    type: string;
  }): Promise<{ id: string } | null>;
  findDisabledPreferences(input: {
    channel: string;
    pairs: NotificationPreferenceKey[];
  }): Promise<string[]>;
  markDeliveryForRetry(input: RetryAuditInput): Promise<void>;
  markOutboxForRetry(input: RetryAuditInput & { deliveryId: string | null }): Promise<void>;
}
