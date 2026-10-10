import { randomUUID } from "node:crypto";
import { prisma } from "@/libs/prismaClient";
import { getModuleLogger } from "@/shared/utils/logger";
import { sanitizeNotificationError } from "@/modules/notifications/services/notificationSecurity";
import {
  getNotificationV2Mode,
  extractCorrelationIdFromOutbox,
} from "@/modules/notifications/services/notificationDeliveryService";
import { getNotificationQueue } from "./notificationQueue";
import {
  getCorrelationId,
  newCorrelationId,
  runWithCorrelationId,
} from "@/shared/utils/correlationContext";

const logger = getModuleLogger("queue:notification-dispatcher");
const INSTANCE_ID = `${process.pid}:${randomUUID()}`;
const MIN_INTERVAL_MS = 500;
const MAX_INTERVAL_MS = 30_000;
const IDLE_BACKOFF_FACTOR = 1.5;
const JITTER_RATIO = 0.15;
const LEASE_MS = 60_000;
const BATCH_SIZE = 25;

interface BatchOutcome {
  processed: number;
  returned: number;
}

let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;
let starting = false;
let stopping = false;
let currentIntervalMs = MIN_INTERVAL_MS;

function nextBackoff(attempts: number): Date {
  const delay = Math.min(5 * 60_000, 2_000 * 2 ** Math.min(attempts, 8));
  return new Date(Date.now() + delay);
}

async function dispatchBatch(): Promise<BatchOutcome | null> {
  if (running || getNotificationV2Mode() !== "active") return null;
  running = true;
  let processed = 0;
  let returned = 0;
  // Escopo do lote: logs de varredura/estrutura ficam correlacionáveis;
  // cada candidato depois herda o correlationId gravado no outbox.
  const correlationIdLote = getCorrelationId() ?? newCorrelationId("outbox-dispatch");
  try {
    await runWithCorrelationId(correlationIdLote, async () => {
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
      returned = candidates.length;

      for (const candidate of candidates) {
        if (!["PENDING", "QUEUED", "RETRYING"].includes(candidate.delivery.status)) {
          await prisma.notificationOutbox.update({
            where: { id: candidate.id },
            data: { status: "PUBLISHED", lockedAt: null, lockedBy: null },
          });
          processed++;
          continue;
        }

        const correlationId =
          extractCorrelationIdFromOutbox(candidate) ??
          getCorrelationId() ??
          newCorrelationId("outbox-dispatch");
        await runWithCorrelationId(correlationId, async () => {
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
          if (claimed.count !== 1) return;
          processed++;

          try {
            await getNotificationQueue().add(
              "deliver",
              { deliveryId: candidate.deliveryId, correlationId },
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
            logger.warn(
              { deliveryId: candidate.deliveryId, correlationId, code: safe.code },
              "Falha ao publicar outbox",
            );
          }
        });
      }
    });
  } finally {
    running = false;
  }
  return { processed, returned };
}

function applyOutcome(outcome: BatchOutcome | null): void {
  if (!outcome) return;
  if (outcome.processed > 0 || outcome.returned >= BATCH_SIZE) {
    currentIntervalMs = MIN_INTERVAL_MS;
    return;
  }
  currentIntervalMs = Math.min(
    MAX_INTERVAL_MS,
    Math.round(Math.max(currentIntervalMs, MIN_INTERVAL_MS) * IDLE_BACKOFF_FACTOR)
  );
}

function nextDelayMs(): number {
  const jitter = 1 + (Math.random() * 2 - 1) * JITTER_RATIO;
  return Math.min(
    MAX_INTERVAL_MS,
    Math.max(MIN_INTERVAL_MS, Math.round(currentIntervalMs * jitter))
  );
}

function scheduleNextTick(): void {
  if (stopping || timer) return;
  timer = setTimeout(runTick, nextDelayMs());
  timer.unref?.();
}

async function runTick(): Promise<void> {
  timer = null;
  let outcome: BatchOutcome | null = null;
  const correlationId = getCorrelationId() ?? newCorrelationId("outbox-dispatch");
  try {
    outcome = await runWithCorrelationId(correlationId, () => dispatchBatch());
  } catch (err) {
    logger.error({ err, correlationId }, "Falha no dispatcher");
  }
  applyOutcome(outcome);
  scheduleNextTick();
}

export async function startNotificationDispatcher(): Promise<void> {
  if (timer || starting || process.env.VITEST || getNotificationV2Mode() !== "active") return;
  starting = true;
  try {
    stopping = false;
    currentIntervalMs = MIN_INTERVAL_MS;
    const outcome = await dispatchBatch();
    applyOutcome(outcome);
    scheduleNextTick();
  } finally {
    starting = false;
  }
  logger.info({ instanceId: INSTANCE_ID }, "Notification outbox dispatcher started");
}

export async function stopNotificationDispatcher(): Promise<void> {
  stopping = true;
  if (timer) clearTimeout(timer);
  timer = null;
  while (running) await new Promise((resolve) => setTimeout(resolve, 25));
}

export async function dispatchNotificationOutboxNow(): Promise<void> {
  const outcome = await dispatchBatch();
  applyOutcome(outcome);
}
