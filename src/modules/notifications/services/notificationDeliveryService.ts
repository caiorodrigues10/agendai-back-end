import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import {
  decryptNotificationPayload,
  encryptNotificationPayload,
  hashNotificationContent,
  hashNotificationDestination,
  maskDestination,
  normalizeDestination,
  sanitizeNotificationError,
  type EncryptedNotificationPayload,
} from "./notificationSecurity";
import {
  canOwnerConfigureNotification,
  type NotificationChannelName,
  type NotificationType,
} from "./notificationRegistry";
import { getCorrelationId } from "@/shared/utils/correlationContext";

export type NotificationV2Mode = "disabled" | "shadow" | "active";

export function getNotificationV2Mode(): NotificationV2Mode {
  const raw = process.env.NOTIFICATION_V2_MODE?.trim().toLowerCase();
  return raw === "active" || raw === "shadow" ? raw : "disabled";
}

export interface NotificationPayload extends Record<string, unknown> {
  channel: NotificationChannelName;
  destination: string;
  whatsapp?: {
    message: string;
    instanceName?: string;
    platform?: boolean;
  };
  email?: Record<string, unknown>;
  /**
   * correlationId do contexto que agendou. Persistido junto do payload
   * criptografado do outbox — é a ponte que permite ao dispatcher
   * reconectar o job ao request/webhook original (B21).
   */
  correlationId?: string;
}

export interface ScheduleNotificationInput {
  channel: NotificationChannelName;
  type: NotificationType;
  destination: string;
  contentForHash: string;
  payload: NotificationPayload;
  idempotencyKey: string;
  templateKey?: string;
  templateVersion?: number;
  barbershopId?: string | null;
  clientId?: string | null;
  userId?: string | null;
  campaignRecipientId?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  retryOfId?: string | null;
  skipReason?: string | null;
}

function uniqueKey(input: ScheduleNotificationInput) {
  return {
    channel_idempotencyKey: {
      channel: input.channel,
      idempotencyKey: input.idempotencyKey,
    },
  };
}

async function findExisting(input: ScheduleNotificationInput, db: any) {
  return db.notificationDelivery.findUnique({ where: uniqueKey(input) });
}

async function resolveSkipReason(
  input: ScheduleNotificationInput,
  destinationHash: string,
  db: any,
): Promise<string | null> {
  if (input.skipReason) return input.skipReason;
  const normalized = normalizeDestination(input.channel, input.destination);
  if (!normalized || (input.channel === "EMAIL" && !normalized.includes("@"))) {
    return "INVALID_DESTINATION";
  }
  if (
    input.channel === "WHATSAPP" &&
    !input.payload.whatsapp?.platform &&
    !input.payload.whatsapp?.instanceName?.trim()
  ) {
    return "CHANNEL_NOT_CONFIGURED";
  }

  if (input.barbershopId && canOwnerConfigureNotification(input.type)) {
    const preference = await db.notificationPreference.findUnique({
      where: {
        barbershopId_channel_type: {
          barbershopId: input.barbershopId,
          channel: input.channel,
          type: input.type,
        },
      },
      select: { enabled: true },
    });
    if (preference && !preference.enabled) return "PREFERENCE_DISABLED";
  }

  const scopeKeys = input.barbershopId ? ["global", input.barbershopId] : ["global"];
  const suppression = await db.notificationSuppression.findFirst({
    where: {
      scopeKey: { in: scopeKeys },
      channel: input.channel,
      destinationHash,
      active: true,
    },
    select: { id: true },
  });
  return suppression ? "DESTINATION_SUPPRESSED" : null;
}

/**
 * Persiste o ledger e o payload criptografado antes de qualquer acesso ao Redis.
 * `db` pode ser um Prisma TransactionClient para participar da transação de domínio.
 */
export async function scheduleNotification(
  input: ScheduleNotificationInput,
  db: any = prisma,
): Promise<any> {
  if (input.idempotencyKey.length > 180) {
    throw new AppError("Chave de idempotência da notificação é muito longa", 400);
  }
  const existing = await findExisting(input, db);
  if (existing) return existing;

  const normalizedDestination = normalizeDestination(input.channel, input.destination);
  const destinationHash = hashNotificationDestination(normalizedDestination);
  const skipReason = await resolveSkipReason(input, destinationHash, db);
  const baseData = {
    barbershopId: input.barbershopId ?? null,
    clientId: input.clientId ?? null,
    userId: input.userId ?? null,
    campaignRecipientId: input.campaignRecipientId ?? null,
    channel: input.channel,
    type: input.type,
    templateKey: input.templateKey ?? input.type,
    templateVersion: input.templateVersion ?? 1,
    idempotencyKey: input.idempotencyKey,
    destinationMasked: maskDestination(input.channel, normalizedDestination),
    destinationHash,
    contentHash: hashNotificationContent(input.contentForHash),
    sourceType: input.sourceType ?? null,
    sourceId: input.sourceId ?? null,
    retryOfId: input.retryOfId ?? null,
  };

  // Correlação vigente no contexto (request/cron) sobrescreve a herdada:
  // cada agendamento fica ligado à origem imediata que o disparou.
  const correlationId = getCorrelationId() ?? input.payload.correlationId;
  const payload = correlationId ? { ...input.payload, correlationId } : input.payload;

  try {
    if (skipReason) {
      return await db.notificationDelivery.create({
        data: {
          ...baseData,
          status: "SKIPPED",
          errorCode: skipReason,
          errorMessage: "Notificação ignorada pela política de envio.",
          failedAt: new Date(),
        },
      });
    }

    const encrypted = encryptNotificationPayload(payload);
    return await db.notificationDelivery.create({
      data: {
        ...baseData,
        status: "PENDING",
        outbox: {
          create: {
            payloadCiphertext: encrypted.ciphertext,
            payloadIv: encrypted.iv,
            payloadTag: encrypted.tag,
            keyVersion: encrypted.keyVersion,
          },
        },
      },
    });
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      const duplicate = await findExisting(input, db);
      if (duplicate) return duplicate;
    }
    throw error;
  }
}

export async function loadNotificationPayload(deliveryId: string): Promise<NotificationPayload> {
  const outbox = await prisma.notificationOutbox.findUnique({
    where: { deliveryId },
    select: {
      payloadCiphertext: true,
      payloadIv: true,
      payloadTag: true,
      keyVersion: true,
    },
  });
  if (!outbox) {
    throw new AppError(
      "O payload desta notificação não está mais disponível.",
      409,
      undefined,
      "NOTIFICATION_PAYLOAD_PURGED",
    );
  }
  return decryptNotificationPayload<NotificationPayload>({
    ciphertext: outbox.payloadCiphertext,
    iv: outbox.payloadIv,
    tag: outbox.payloadTag,
    keyVersion: outbox.keyVersion,
  });
}

export async function retryNotification(
  deliveryId: string,
  idempotencyKey: string,
  barbershopId?: string,
): Promise<any> {
  const original = await prisma.notificationDelivery.findUnique({ where: { id: deliveryId } });
  if (!original || (barbershopId && original.barbershopId !== barbershopId)) {
    throw new AppError("Notificação não encontrada", 404);
  }
  if (original.status !== "FAILED") {
    throw new AppError(
      "Somente falhas técnicas podem ser reenviadas.",
      409,
      undefined,
      "NOTIFICATION_NOT_RETRYABLE",
    );
  }
  const ageMs = Date.now() - original.createdAt.getTime();
  if (ageMs > 7 * 24 * 60 * 60 * 1000) {
    throw new AppError(
      "O prazo de reenvio desta notificação expirou.",
      409,
      undefined,
      "NOTIFICATION_RETRY_EXPIRED",
    );
  }
  const payload = await loadNotificationPayload(original.id);
  const content = payload.whatsapp?.message ?? JSON.stringify(payload.email ?? {});
  return scheduleNotification({
    channel: original.channel as NotificationChannelName,
    type: original.type as NotificationType,
    destination: payload.destination,
    contentForHash: content,
    payload,
    idempotencyKey: `retry:${original.id}:${idempotencyKey}`,
    templateKey: original.templateKey ?? undefined,
    templateVersion: original.templateVersion,
    barbershopId: original.barbershopId,
    clientId: original.clientId,
    userId: original.userId,
    campaignRecipientId: null,
    sourceType: original.sourceType,
    sourceId: original.sourceId,
    retryOfId: original.id,
  });
}

export async function recordTerminalNotificationFailure(
  deliveryId: string,
  error: unknown,
): Promise<void> {
  const safe = sanitizeNotificationError(error);
  const purgeAfter = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await prisma.$transaction([
    prisma.notificationDelivery.update({
      where: { id: deliveryId },
      data: {
        status: "FAILED",
        errorCode: safe.code,
        errorMessage: safe.message,
        failedAt: new Date(),
      },
    }),
    prisma.notificationOutbox.update({
      where: { deliveryId },
      data: { purgeAfter },
    }),
  ]);
}

export function encryptedPayloadFromRecord(record: any): EncryptedNotificationPayload {
  return {
    ciphertext: record.payloadCiphertext,
    iv: record.payloadIv,
    tag: record.payloadTag,
    keyVersion: record.keyVersion,
  };
}

/**
 * Lê o correlationId persistido no payload criptografado de uma linha de
 * outbox. Usado pelo dispatcher para religar o job ao request/webhook que
 * originou a notificação. Retorna undefined quando o registro não tem
 * payload utilizável (chave rotacionada, registro legado) — o chamador
 * cai em um correlationId autônomo.
 */
export function extractCorrelationIdFromOutbox(outbox: {
  payloadCiphertext?: unknown;
  payloadIv?: unknown;
  payloadTag?: unknown;
  keyVersion?: unknown;
}): string | undefined {
  if (
    typeof outbox.payloadCiphertext !== "string" ||
    typeof outbox.payloadIv !== "string" ||
    typeof outbox.payloadTag !== "string" ||
    typeof outbox.keyVersion !== "string"
  ) {
    return undefined;
  }
  try {
    const payload = decryptNotificationPayload<NotificationPayload>({
      ciphertext: outbox.payloadCiphertext,
      iv: outbox.payloadIv,
      tag: outbox.payloadTag,
      keyVersion: outbox.keyVersion,
    });
    return typeof payload.correlationId === "string" ? payload.correlationId : undefined;
  } catch {
    return undefined;
  }
}
