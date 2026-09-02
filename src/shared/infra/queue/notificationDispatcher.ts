import { randomUUID } from "node:crypto";
import { prisma } from "@/libs/prismaClient";
import { getModuleLogger } from "@/shared/utils/logger";
import { sanitizeNotificationError } from "@/modules/notifications/services/notificationSecurity";
import { getNotificationV2Mode } from "@/modules/notifications/services/notificationDeliveryService";
import { getNotificationQueue } from "./notificationQueue";

const logger = getModuleLogger("queue:notification-dispatcher");
const INSTANCE_ID = `${process.pid}:${randomUUID()}`;
const INTERVAL_MS = 2_000;
const LEASE_MS = 60_000;
const BATCH_SIZE = 25;

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

function nextBackoff(attempts: number): Date {
  const delay = Math.min(5 * 60_000, 2_000 * 2 ** Math.min(attempts, 8));
  return new Date(Date.now() + delay);
}

async function dispatchBatch(): Promise<void> {
  if (running || getNotificationV2Mode() !== "active") return;
  running = true;
  try {
    const now = new Date();
    const leaseExpiredAt = new Date(now.getTime() - LEASE_MS);
    const candidates = await prisma.notificationOutbox.findMany({
      where: {
        nextAttemptAt: { lte: now },
        OR: [
          { status: { in: ["PENDING", "FAILED"] } },
          { status: "PUBLISHING", lockedAt: { lt: leaseExpiredAt } },
        ],
      },
      orderBy: { createdAt: "asc" },
      take: BATCH_SIZE,
      include: { delivery: { select: { status: true } } },
    });

    for (const candidate of candidates) {
      if (!["PENDING", "QUEUED", "RETRYING"].includes(candidate.delivery.status)) {
        await prisma.notificationOutbox.update({
          where: { id: candidate.id },
          data: { status: "PUBLISHED", lockedAt: null, lockedBy: null },
        });
        continue;
      }
      const claimed = await prisma.notificationOutbox.updateMany({
        where: {
          id: candidate.id,
          OR: [
            { status: { in: ["PENDING", "FAILED"] } },
            { status: "PUBLISHING", lockedAt: { lt: leaseExpiredAt } },
          ],
        },
        data: {
          status: "PUBLISHING",
          lockedAt: now,
          lockedBy: INSTANCE_ID,
          publishAttempts: { increment: 1 },
        },
      });
      if (claimed.count !== 1) continue;

      try {
        await getNotificationQueue().add(
          "deliver",
          { deliveryId: candidate.deliveryId },
          { jobId: candidate.deliveryId },
        );
        await prisma.$transaction([
          prisma.notificationOutbox.update({
            where: { id: candidate.id },
            data: {
              status: "PUBLISHED",
              publishedAt: new Date(),
              lockedAt: null,
              lockedBy: null,
              lastError: null,
            },
          }),
          prisma.notificationDelivery.updateMany({
            where: { id: candidate.deliveryId, status: { in: ["PENDING", "RETRYING"] } },
            data: { status: "QUEUED", queuedAt: new Date() },
          }),
        ]);
      } catch (error) {
        const safe = sanitizeNotificationError(error);
        await prisma.notificationOutbox.update({
          where: { id: candidate.id },
          data: {
            status: "FAILED",
            nextAttemptAt: nextBackoff(candidate.publishAttempts + 1),
            lockedAt: null,
            lockedBy: null,
            lastError: safe.message,
          },
        });
        logger.warn({ deliveryId: candidate.deliveryId, code: safe.code }, "Falha ao publicar outbox");
      }
    }
  } finally {
    running = false;
  }
}

export async function startNotificationDispatcher(): Promise<void> {
  if (timer || process.env.VITEST || getNotificationV2Mode() !== "active") return;
  await dispatchBatch();
  timer = setInterval(() => {
    dispatchBatch().catch((err) => logger.error({ err }, "Falha no dispatcher"));
  }, INTERVAL_MS);
  timer.unref?.();
  logger.info({ instanceId: INSTANCE_ID }, "Notification outbox dispatcher started");
}

export async function stopNotificationDispatcher(): Promise<void> {
  if (timer) clearInterval(timer);
  timer = null;
  while (running) await new Promise((resolve) => setTimeout(resolve, 25));
}

export async function dispatchNotificationOutboxNow(): Promise<void> {
  await dispatchBatch();
}
