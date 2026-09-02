import { Job, Worker } from "bullmq";
import type { Prisma } from "@prisma/client";
import { container } from "tsyringe";
import { prisma } from "@/libs/prismaClient";
import { refreshCrmCampaignStatus } from "@/modules/crm/services/campaignStatusService";
import {
  getNotificationV2Mode,
  loadNotificationPayload,
} from "@/modules/notifications/services/notificationDeliveryService";
import { sanitizeNotificationError } from "@/modules/notifications/services/notificationSecurity";
import type { IEmailProvider } from "@/shared/container/providers/EmailProvider/IEmailProvider";
import { sendWhatsAppMessageDetailed } from "@/shared/services/evolutionApiService";
import { getModuleLogger } from "@/shared/utils/logger";
import type { EmailJobData } from "./emailQueue";
import { buildEmailPayload } from "./emailWorker";
import type { NotificationJobData } from "./notificationQueue";
import { NOTIFICATION_QUEUE_NAME } from "./notificationQueue";
import { getRedisConnection } from "./redisConnection";

const logger = getModuleLogger("queue:notification-worker");
const PAYLOAD_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

let worker: Worker<NotificationJobData> | null = null;

function isFinalAttempt(job: Job<NotificationJobData>): boolean {
  return job.attemptsMade + 1 >= Number(job.opts.attempts ?? 1);
}

async function updateCampaignRecipient(
  campaignRecipientId: string | null,
  status: "SENT" | "FAILED" | "SKIPPED",
  error?: string,
): Promise<void> {
  if (!campaignRecipientId) return;
  const recipient = await prisma.crmCampaignRecipient.update({
    where: { id: campaignRecipientId },
    data: {
      status,
      sentAt: status === "SENT" ? new Date() : null,
      error: error?.slice(0, 2_000) ?? null,
    },
    select: { campaignId: true },
  });
  await refreshCrmCampaignStatus(recipient.campaignId);
}

async function claimAttempt(deliveryId: string): Promise<{
  attemptId: string;
  attemptNumber: number;
  campaignRecipientId: string | null;
  channel: "EMAIL" | "WHATSAPP";
  type: string;
  sourceId: string | null;
}> {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const delivery = await tx.notificationDelivery.findUnique({
      where: { id: deliveryId },
      select: {
        status: true,
        attemptCount: true,
        campaignRecipientId: true,
        channel: true,
        type: true,
        sourceId: true,
      },
    });
    if (!delivery) throw new Error("NOTIFICATION_DELIVERY_NOT_FOUND");
    if (
      ["SENT", "DELIVERED", "READ", "BOUNCED", "COMPLAINED", "SUPPRESSED", "SKIPPED", "CANCELED"].includes(
        delivery.status,
      )
    ) {
      throw new Error("NOTIFICATION_ALREADY_TERMINAL");
    }

    const attemptNumber = delivery.attemptCount + 1;
    const attempt = await tx.notificationAttempt.create({
      data: { deliveryId, attemptNumber, status: "PROCESSING" },
      select: { id: true },
    });
    await tx.notificationDelivery.update({
      where: { id: deliveryId },
      data: {
        status: "PROCESSING",
        processingAt: new Date(),
        attemptCount: attemptNumber,
        errorCode: null,
        errorMessage: null,
      },
    });

    return {
      attemptId: attempt.id,
      attemptNumber,
      campaignRecipientId: delivery.campaignRecipientId,
      channel: delivery.channel,
      type: delivery.type,
      sourceId: delivery.sourceId,
    };
  });
}

async function completeAttempt(
  deliveryId: string,
  attemptId: string,
  result: {
    provider: "RESEND" | "EVOLUTION";
    providerId?: string;
    providerStatus?: string;
    httpStatus?: number;
    skipped?: boolean;
  },
): Promise<void> {
  const now = new Date();
  await prisma.$transaction([
    prisma.notificationAttempt.update({
      where: { id: attemptId },
      data: {
        status: "SUCCEEDED",
        providerId: result.providerId ?? null,
        providerStatus: result.providerStatus ?? (result.skipped ? "skipped" : "accepted"),
        httpStatus: result.httpStatus ?? null,
        completedAt: now,
      },
    }),
    prisma.notificationDelivery.update({
      where: { id: deliveryId },
      data: {
        status: result.skipped ? "SKIPPED" : "SENT",
        provider: result.provider,
        providerId: result.providerId ?? null,
        sentAt: result.skipped ? null : now,
        failedAt: result.skipped ? now : null,
        errorCode: result.skipped ? "PROVIDER_SKIPPED" : null,
        errorMessage: result.skipped ? "Envio ignorado pela configuração do provedor." : null,
      },
    }),
    prisma.notificationOutbox.update({
      where: { deliveryId },
      data: { purgeAfter: new Date(now.getTime() + PAYLOAD_RETENTION_MS) },
    }),
  ]);
}

async function failAttempt(
  deliveryId: string,
  attemptId: string,
  error: unknown,
  finalAttempt: boolean,
): Promise<{ code: string; message: string }> {
  const safe = sanitizeNotificationError(error);
  const now = new Date();
  await prisma.$transaction([
    prisma.notificationAttempt.update({
      where: { id: attemptId },
      data: {
        status: "FAILED",
        errorCode: safe.code,
        errorMessage: safe.message,
        completedAt: now,
      },
    }),
    prisma.notificationDelivery.update({
      where: { id: deliveryId },
      data: {
        status: finalAttempt ? "FAILED" : "RETRYING",
        errorCode: safe.code,
        errorMessage: safe.message,
        failedAt: finalAttempt ? now : null,
      },
    }),
    ...(finalAttempt
      ? [
          prisma.notificationOutbox.update({
            where: { deliveryId },
            data: { purgeAfter: new Date(now.getTime() + PAYLOAD_RETENTION_MS) },
          }),
        ]
      : []),
  ]);
  return safe;
}

async function processNotification(job: Job<NotificationJobData>): Promise<{ sent: boolean }> {
  let claimed:
    | Awaited<ReturnType<typeof claimAttempt>>
    | undefined;
  try {
    claimed = await claimAttempt(job.data.deliveryId);
  } catch (error) {
    if ((error as Error).message === "NOTIFICATION_ALREADY_TERMINAL") {
      return { sent: true };
    }
    throw error;
  }

  try {
    const payload = await loadNotificationPayload(job.data.deliveryId);
    if (claimed.channel === "WHATSAPP") {
      if (!payload.whatsapp) throw new Error("NOTIFICATION_PAYLOAD_CHANNEL_MISMATCH");
      const result = await sendWhatsAppMessageDetailed(
        payload.destination,
        payload.whatsapp.message,
        {
          instanceName: payload.whatsapp.instanceName,
          platform: payload.whatsapp.platform,
        },
      );
      if (!result.ok) {
        const error = new Error(result.error ?? "Falha no envio pelo WhatsApp");
        Object.assign(error, { code: result.errorCode });
        throw error;
      }
      await completeAttempt(job.data.deliveryId, claimed.attemptId, {
        provider: "EVOLUTION",
        providerId: result.providerId,
        providerStatus: result.providerStatus,
        httpStatus: result.httpStatus,
      });
    } else {
      if (!payload.email) throw new Error("NOTIFICATION_PAYLOAD_CHANNEL_MISMATCH");
      const emailProvider = container.resolve<IEmailProvider>("EmailProvider");
      const emailPayload = buildEmailPayload(payload.email as unknown as EmailJobData);
      const result = await emailProvider.send({ ...emailPayload, trackLegacyDelivery: false });
      if (!result.ok) throw new Error(result.error ?? "Falha no envio pelo Resend");
      await completeAttempt(job.data.deliveryId, claimed.attemptId, {
        provider: "RESEND",
        providerId: result.providerId,
        providerStatus: result.skipped ? "skipped" : "accepted",
        skipped: result.skipped,
      });
    }

    if (!claimed.campaignRecipientId && claimed.type === "APPOINTMENT_REMINDER" && claimed.sourceId) {
      await prisma.appointment.updateMany({
        where: { id: claimed.sourceId, reminderSentAt: null },
        data: { reminderSentAt: new Date() },
      });
    }
    await updateCampaignRecipient(
      claimed.campaignRecipientId,
      "SENT",
    );
    return { sent: true };
  } catch (error) {
    const finalAttempt = isFinalAttempt(job);
    const safe = await failAttempt(
      job.data.deliveryId,
      claimed.attemptId,
      error,
      finalAttempt,
    );
    if (finalAttempt) {
      await updateCampaignRecipient(claimed.campaignRecipientId, "FAILED", safe.message).catch(
        (campaignError) =>
          logger.error({ err: campaignError }, "Falha ao atualizar destinatário da campanha"),
      );
    }
    throw error;
  }
}

function createWorker(): Worker<NotificationJobData> {
  const instance = new Worker<NotificationJobData>(
    NOTIFICATION_QUEUE_NAME,
    processNotification,
    {
      connection: getRedisConnection(),
      concurrency: 5,
      limiter: { max: 10, duration: 1_000 },
    },
  );
  instance.on("failed", (job, error) => {
    logger.warn(
      { jobId: job?.id, attempt: job?.attemptsMade, code: sanitizeNotificationError(error).code },
      "Tentativa da notificação falhou",
    );
  });
  instance.on("error", (error) => logger.error({ err: error }, "Notification worker error"));
  return instance;
}

export async function startNotificationWorker(): Promise<void> {
  if (process.env.VITEST || worker || getNotificationV2Mode() !== "active") return;
  worker = createWorker();
  await worker.waitUntilReady();
  logger.info("Notification V2 worker started");
}

export async function stopNotificationWorker(): Promise<void> {
  if (!worker) return;
  await worker.close();
  worker = null;
  logger.info("Notification V2 worker stopped");
}
