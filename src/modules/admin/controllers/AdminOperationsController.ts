import { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "@/libs/prismaClient";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const FAILED_DELIVERY_STATUSES = ["FAILED", "BOUNCED", "COMPLAINED", "SUPPRESSED"];

type CountRow = { _count: { _all: number } };

export class AdminOperationsController {
  async health(_request: FastifyRequest, reply: FastifyReply) {
    const now = new Date();
    const since24h = new Date(now.getTime() - DAY_MS);
    const since1h = new Date(now.getTime() - HOUR_MS);

    const [
      errors24h,
      errors5xx24h,
      errors5xxLastHour,
      errorsByStatus,
      topPaths,
      cronFailures24h,
      cronRunning,
      recentCronFailures,
      whatsapp24h,
      whatsappFailed24h,
      email24h,
      emailFailed24h,
      outboxPending,
      outboxFailed,
    ] = await Promise.all([
      prisma.errorLog.count({ where: { createdAt: { gte: since24h } } }),
      prisma.errorLog.count({
        where: { createdAt: { gte: since24h }, statusCode: { gte: 500 } },
      }),
      prisma.errorLog.count({
        where: { createdAt: { gte: since1h }, statusCode: { gte: 500 } },
      }),
      prisma.errorLog.groupBy({
        by: ["statusCode"],
        where: { createdAt: { gte: since24h } },
        _count: { _all: true },
        orderBy: { _count: { statusCode: "desc" } },
        take: 6,
      }),
      prisma.errorLog.groupBy({
        by: ["path", "method"],
        where: { createdAt: { gte: since24h } },
        _count: { _all: true },
        orderBy: { _count: { path: "desc" } },
        take: 6,
      }),
      prisma.cronRun.count({
        where: { status: "FAILED", startedAt: { gte: since24h } },
      }),
      prisma.cronRun.count({ where: { status: "RUNNING" } }),
      prisma.cronRun.findMany({
        where: { status: "FAILED" },
        orderBy: { startedAt: "desc" },
        take: 5,
        select: { id: true, jobName: true, startedAt: true, error: true },
      }),
      prisma.notificationDelivery.count({
        where: { channel: "WHATSAPP", createdAt: { gte: since24h } },
      }),
      prisma.notificationDelivery.count({
        where: {
          channel: "WHATSAPP",
          createdAt: { gte: since24h },
          status: { in: FAILED_DELIVERY_STATUSES },
        },
      }),
      prisma.notificationDelivery.count({
        where: { channel: "EMAIL", createdAt: { gte: since24h } },
      }),
      prisma.notificationDelivery.count({
        where: {
          channel: "EMAIL",
          createdAt: { gte: since24h },
          status: { in: FAILED_DELIVERY_STATUSES },
        },
      }),
      prisma.notificationOutbox.count({ where: { status: "PENDING" } }),
      prisma.notificationOutbox.count({ where: { status: "FAILED" } }),
    ]);

    const whatsappFailedRate =
      whatsapp24h > 0 ? Math.round((whatsappFailed24h / whatsapp24h) * 1000) / 10 : 0;
    const emailFailedRate =
      email24h > 0 ? Math.round((emailFailed24h / email24h) * 1000) / 10 : 0;

    let status: "HEALTHY" | "DEGRADED" | "UNHEALTHY" = "HEALTHY";
    if (errors5xxLastHour > 0 || cronFailures24h > 0 || outboxFailed > 0) {
      status = "DEGRADED";
    }
    if (
      errors5xxLastHour >= 10 ||
      cronFailures24h >= 5 ||
      whatsappFailedRate >= 50 ||
      emailFailedRate >= 50
    ) {
      status = "UNHEALTHY";
    }

    return reply.status(200).send({
      success: true,
      data: {
        generatedAt: now.toISOString(),
        status,
        errors: {
          total24h: errors24h,
          last24h5xx: errors5xx24h,
          lastHour5xx: errors5xxLastHour,
          byStatus: errorsByStatus.map((row: { statusCode: number } & CountRow) => ({
            statusCode: row.statusCode,
            count: row._count._all,
          })),
          topPaths: topPaths.map(
            (row: { path: string; method: string } & CountRow) => ({
              path: row.path,
              method: row.method,
              count: row._count._all,
            }),
          ),
        },
        cron: {
          failures24h: cronFailures24h,
          running: cronRunning,
          recentFailures: recentCronFailures.map(
            (row: { id: string; jobName: string; startedAt: Date; error: string | null }) => ({
              id: row.id,
              jobName: row.jobName,
              startedAt: row.startedAt.toISOString(),
              error: row.error,
            }),
          ),
        },
        delivery: {
          whatsapp: { total24h: whatsapp24h, failed24h: whatsappFailed24h, failedRatePct: whatsappFailedRate },
          email: { total24h: email24h, failed24h: emailFailed24h, failedRatePct: emailFailedRate },
        },
        outbox: { pending: outboxPending, failed: outboxFailed },
      },
    });
  }
}
