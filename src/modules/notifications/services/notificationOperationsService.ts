import { prisma } from "@/libs/prismaClient";
import { getNotificationQueue } from "@/shared/infra/queue/notificationQueue";
import { processHeartbeatKey } from "@/shared/infra/queue/processHeartbeat";
import { getRedisConnection } from "@/shared/infra/queue/redisConnection";

const STALE_AFTER_MS = 45_000;
const OUTBOX_WARNING_MS = 5 * 60_000;

function heartbeatStatus(value: string | null, now: Date) {
  if (!value) return { status: "OFFLINE", lastHeartbeatAt: null };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { status: "OFFLINE", lastHeartbeatAt: null };
  return {
    status: now.getTime() - date.getTime() <= STALE_AFTER_MS ? "HEALTHY" : "STALE",
    lastHeartbeatAt: date.toISOString(),
  };
}

export async function getNotificationOperationsHealth() {
  const now = new Date();
  const since = new Date(now.getTime() - 15 * 60_000);
  const redis = getRedisConnection();
  const [heartbeatValues, queueCounts, pending, processing, oldest, totalRecent, failedRecent] =
    await Promise.all([
      redis.mget(processHeartbeatKey("worker"), processHeartbeatKey("scheduler")),
      getNotificationQueue().getJobCounts("waiting", "active", "delayed", "failed"),
      prisma.notificationOutbox.count({ where: { status: { in: ["PENDING", "FAILED"] } } }),
      prisma.notificationOutbox.count({ where: { status: "PUBLISHING" } }),
      prisma.notificationOutbox.findFirst({
        where: { status: { in: ["PENDING", "FAILED", "PUBLISHING"] } },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      }),
      prisma.notificationDelivery.count({ where: { createdAt: { gte: since } } }),
      prisma.notificationDelivery.count({
        where: {
          createdAt: { gte: since },
          status: { in: ["FAILED", "BOUNCED", "COMPLAINED", "SUPPRESSED"] },
        },
      }),
    ]);

  const worker = heartbeatStatus(heartbeatValues[0], now);
  const scheduler = heartbeatStatus(heartbeatValues[1], now);
  const oldestAge = oldest ? now.getTime() - oldest.createdAt.getTime() : 0;
  const failureRate = totalRecent > 0 ? (failedRecent / totalRecent) * 100 : 0;
  const status =
    worker.status === "OFFLINE" || scheduler.status === "OFFLINE"
      ? "UNHEALTHY"
      : worker.status !== "HEALTHY" || scheduler.status !== "HEALTHY" || oldestAge > OUTBOX_WARNING_MS
        ? "DEGRADED"
        : "HEALTHY";

  return {
    status,
    worker,
    scheduler,
    outbox: {
      pending,
      processing,
      oldestPendingAt: oldest?.createdAt.toISOString() ?? null,
    },
    queue: {
      waiting: queueCounts.waiting ?? 0,
      active: queueCounts.active ?? 0,
      delayed: queueCounts.delayed ?? 0,
      failed: queueCounts.failed ?? 0,
    },
    deliveries: {
      totalLast15Minutes: totalRecent,
      failedLast15Minutes: failedRecent,
      failureRate: Number(failureRate.toFixed(2)),
    },
    checkedAt: now.toISOString(),
  };
}

