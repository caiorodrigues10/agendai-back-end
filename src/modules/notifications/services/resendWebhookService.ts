import { createHash } from "node:crypto";
import type { WebhookEventPayload } from "resend";
import { prisma } from "@/libs/prismaClient";
import { sanitizeNotificationError } from "./notificationSecurity";

type EmailWebhookEvent = Extract<WebhookEventPayload, { type: `email.${string}` }>;

function isEmailEvent(event: WebhookEventPayload): event is EmailWebhookEvent {
  return event.type.startsWith("email.") && "email_id" in event.data;
}

function occurredAt(event: WebhookEventPayload): Date {
  const parsed = new Date(event.created_at);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function payloadHash(rawBody: string): string {
  return createHash("sha256").update(rawBody).digest("hex");
}

async function addSuppression(
  delivery: {
    barbershopId: string | null;
    destinationHash: string;
    destinationMasked: string;
  },
  reason: string,
): Promise<void> {
  const scopeKey = delivery.barbershopId ?? "global";
  await prisma.notificationSuppression.upsert({
    where: {
      scopeKey_channel_destinationHash: {
        scopeKey,
        channel: "EMAIL",
        destinationHash: delivery.destinationHash,
      },
    },
    create: {
      barbershopId: delivery.barbershopId,
      scopeKey,
      channel: "EMAIL",
      destinationHash: delivery.destinationHash,
      destinationMasked: delivery.destinationMasked,
      reason,
      source: "RESEND_WEBHOOK",
    },
    update: {
      active: true,
      reason,
      source: "RESEND_WEBHOOK",
    },
  });
}

async function applyEmailEvent(
  delivery: {
    id: string;
    status: string;
    barbershopId: string | null;
    destinationHash: string;
    destinationMasked: string;
  },
  event: EmailWebhookEvent,
): Promise<void> {
  const at = occurredAt(event);
  switch (event.type) {
    case "email.sent":
    case "email.scheduled":
      await prisma.notificationDelivery.updateMany({
        where: {
          id: delivery.id,
          status: { in: ["PENDING", "QUEUED", "PROCESSING", "RETRYING"] },
        },
        data: { status: "SENT", sentAt: at },
      });
      break;
    case "email.delivered":
      await prisma.notificationDelivery.updateMany({
        where: {
          id: delivery.id,
          status: { notIn: ["READ", "BOUNCED", "COMPLAINED", "SUPPRESSED", "CANCELED"] },
        },
        data: { status: "DELIVERED", deliveredAt: at },
      });
      break;
    case "email.delivery_delayed":
      await prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: { delayedAt: at },
      });
      break;
    case "email.opened":
      await prisma.notificationDelivery.updateMany({
        where: {
          id: delivery.id,
          status: { notIn: ["BOUNCED", "COMPLAINED", "SUPPRESSED", "CANCELED"] },
        },
        data: { status: "READ", openedAt: at },
      });
      break;
    case "email.clicked":
      await prisma.notificationDelivery.updateMany({
        where: {
          id: delivery.id,
          status: { notIn: ["BOUNCED", "COMPLAINED", "SUPPRESSED", "CANCELED"] },
        },
        data: { status: "READ", clickedAt: at },
      });
      break;
    case "email.failed": {
      const safe = sanitizeNotificationError(event.data.failed.reason);
      await prisma.notificationDelivery.updateMany({
        where: {
          id: delivery.id,
          status: { notIn: ["DELIVERED", "READ", "BOUNCED", "COMPLAINED", "SUPPRESSED", "CANCELED"] },
        },
        data: {
          status: "FAILED",
          failedAt: at,
          errorCode: "RESEND_FAILED",
          errorMessage: safe.message,
        },
      });
      break;
    }
    case "email.bounced":
      await prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "BOUNCED",
          failedAt: at,
          errorCode: "RESEND_BOUNCED",
          errorMessage: sanitizeNotificationError(event.data.bounce.message).message,
        },
      });
      await addSuppression(delivery, "BOUNCED");
      break;
    case "email.complained":
      await prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "COMPLAINED",
          failedAt: at,
          errorCode: "RESEND_COMPLAINED",
          errorMessage: "O destinatário marcou a mensagem como spam.",
        },
      });
      await addSuppression(delivery, "COMPLAINED");
      break;
    case "email.suppressed":
      await prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "SUPPRESSED",
          failedAt: at,
          errorCode: "RESEND_SUPPRESSED",
          errorMessage: sanitizeNotificationError(event.data.suppressed.message).message,
        },
      });
      await addSuppression(delivery, "SUPPRESSED");
      break;
    case "email.received":
      break;
  }
}

export async function processResendWebhook(
  eventId: string,
  event: WebhookEventPayload,
  rawBody: string,
): Promise<"processed" | "ignored" | "duplicate"> {
  let record = await prisma.notificationProviderEvent.findUnique({
    where: { provider_eventId: { provider: "RESEND", eventId } },
  });
  if (record?.status === "PROCESSED" || record?.status === "IGNORED") return "duplicate";

  if (!record) {
    try {
      record = await prisma.notificationProviderEvent.create({
        data: {
          provider: "RESEND",
          eventId,
          eventType: event.type,
          providerObjectId: isEmailEvent(event) ? event.data.email_id : null,
          payloadHash: payloadHash(rawBody),
          occurredAt: occurredAt(event),
        },
      });
    } catch (error) {
      if ((error as { code?: string }).code !== "P2002") throw error;
      record = await prisma.notificationProviderEvent.findUniqueOrThrow({
        where: { provider_eventId: { provider: "RESEND", eventId } },
      });
      if (record.status === "PROCESSED" || record.status === "IGNORED") return "duplicate";
    }
  }

  try {
    if (!isEmailEvent(event)) {
      await prisma.notificationProviderEvent.update({
        where: { id: record.id },
        data: { status: "IGNORED", processedAt: new Date() },
      });
      return "ignored";
    }

    const delivery = await prisma.notificationDelivery.findFirst({
      where: { provider: "RESEND", providerId: event.data.email_id },
      select: {
        id: true,
        status: true,
        barbershopId: true,
        destinationHash: true,
        destinationMasked: true,
      },
    });
    if (!delivery) {
      await prisma.notificationProviderEvent.update({
        where: { id: record.id },
        data: { status: "IGNORED", processedAt: new Date() },
      });
      return "ignored";
    }

    await prisma.notificationProviderEvent.update({
      where: { id: record.id },
      data: { deliveryId: delivery.id },
    });
    await applyEmailEvent(delivery, event);
    await prisma.notificationProviderEvent.update({
      where: { id: record.id },
      data: { status: "PROCESSED", processedAt: new Date(), errorMessage: null },
    });
    return "processed";
  } catch (error) {
    await prisma.notificationProviderEvent.update({
      where: { id: record.id },
      data: {
        status: "FAILED",
        errorMessage: sanitizeNotificationError(error).message,
      },
    });
    throw error;
  }
}

