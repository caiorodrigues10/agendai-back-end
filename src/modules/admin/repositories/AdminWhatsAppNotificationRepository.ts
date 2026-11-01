import { prisma } from "@/libs/prismaClient";
import {
  IAdminWhatsAppNotificationRepository,
  NotificationPreferenceKey,
  RetryAuditInput,
  RetryableNotificationDelivery,
  RetryableNotificationOutbox,
} from "./IAdminWhatsAppNotificationRepository";

export class AdminWhatsAppNotificationRepository
  implements IAdminWhatsAppNotificationRepository
{
  async listFailed() {
    const [deliveries, outbox] = await Promise.all([
      prisma.notificationDelivery.findMany({
        where: { channel: "WHATSAPP", status: { in: ["FAILED", "BOUNCED", "COMPLAINED", "SUPPRESSED"] } },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          barbershopId: true,
          channel: true,
          type: true,
          status: true,
          errorCode: true,
          errorMessage: true,
          createdAt: true,
          destinationHash: true,
        },
      }),
      prisma.notificationOutbox.findMany({
        where: { status: "FAILED" },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          deliveryId: true,
          status: true,
          lastError: true,
          publishAttempts: true,
          createdAt: true,
          delivery: { select: { status: true } },
        },
      }),
    ]);
    return { deliveries, outbox };
  }

  findDelivery(id: string): Promise<RetryableNotificationDelivery | null> {
    return prisma.notificationDelivery.findUnique({
      where: { id },
      select: {
        id: true,
        channel: true,
        status: true,
        destinationHash: true,
        barbershopId: true,
        type: true,
      },
    });
  }

  findOutbox(id: string): Promise<RetryableNotificationOutbox | null> {
    return prisma.notificationOutbox.findUnique({
      where: { id },
      select: {
        id: true,
        deliveryId: true,
        delivery: { select: { status: true, barbershopId: true } },
      },
    });
  }

  findActiveSuppression(input: { channel: string; destinationHash: string }) {
    return prisma.notificationSuppression.findFirst({
      where: {
        channel: input.channel as never,
        destinationHash: input.destinationHash,
        active: true,
      },
      select: { id: true },
    });
  }

  async findActiveSuppressions(input: {
    channel: string;
    destinationHashes: string[];
  }): Promise<string[]> {
    if (input.destinationHashes.length === 0) return [];
    const rows = await prisma.notificationSuppression.findMany({
      where: {
        channel: input.channel as never,
        destinationHash: { in: input.destinationHashes },
        active: true,
      },
      select: { destinationHash: true },
    });
    return rows.map((row) => row.destinationHash);
  }

  async findDisabledPreferences(input: {
    channel: string;
    pairs: NotificationPreferenceKey[];
  }): Promise<string[]> {
    if (input.pairs.length === 0) return [];
    const rows = await prisma.notificationPreference.findMany({
      where: {
        channel: input.channel as never,
        enabled: false,
        OR: input.pairs.map((pair) => ({
          barbershopId: pair.barbershopId,
          type: pair.type,
        })),
      },
      select: { barbershopId: true, type: true },
    });
    return rows.map((row) => `${row.barbershopId}:${row.type}`);
  }

  findDisabledPreference(input: { barbershopId: string; channel: string; type: string }) {
    return prisma.notificationPreference.findFirst({
      where: {
        barbershopId: input.barbershopId,
        channel: input.channel as never,
        type: input.type,
        enabled: false,
      },
      select: { id: true },
    });
  }

  async markDeliveryForRetry(input: RetryAuditInput): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.notificationDelivery.update({
        where: { id: input.id },
        data: { status: "PENDING", failedAt: null },
      });
      await tx.notificationOutbox.updateMany({
        where: { deliveryId: input.id },
        data: { status: "PENDING", nextAttemptAt: new Date(), lastError: null },
      });
      await tx.auditLog.create({
        data: {
          userId: input.userId,
          action: "WHATSAPP_NOTIFICATION_RETRY",
          resource: "NotificationDelivery",
          resourceId: input.id,
          details: JSON.stringify({ reason: input.reason }),
          ipAddress: input.ipAddress,
          barbershopId: input.barbershopId,
        },
      });
    });
  }

  async markOutboxForRetry(
    input: RetryAuditInput & { deliveryId: string | null }
  ): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.notificationOutbox.update({
        where: { id: input.id },
        data: { status: "PENDING", nextAttemptAt: new Date(), lastError: null },
      });
      if (input.deliveryId) {
        await tx.notificationDelivery.updateMany({
          where: { id: input.deliveryId, status: { in: ["FAILED", "BOUNCED"] } },
          data: { status: "PENDING", failedAt: null },
        });
      }
      await tx.auditLog.create({
        data: {
          userId: input.userId,
          action: "WHATSAPP_OUTBOX_RETRY",
          resource: "NotificationOutbox",
          resourceId: input.id,
          details: JSON.stringify({ reason: input.reason }),
          ipAddress: input.ipAddress,
          barbershopId: input.barbershopId,
        },
      });
    });
  }
}
