import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '@/libs/prismaClient';
import { getApiRedisConnection } from '@/shared/infra/queue/redisConnection';

const DEAD_JOB_QUEUES = ['email', 'whatsapp', 'post-broadcast', 'notifications-v2'];
const DEAD_JOBS_PER_QUEUE = 50;

function hoursAgo(h: number): Date {
  return new Date(Date.now() - h * 3600_000);
}
function minutesAgo(m: number): Date {
  return new Date(Date.now() - m * 60_000);
}

async function readDeadJobs(): Promise<string[]> {
  try {
    const redis = getApiRedisConnection();
    const batches = await Promise.all(
      DEAD_JOB_QUEUES.map((queue) =>
        redis
          .zrange(`bull:${queue}:failed`, '0', String(DEAD_JOBS_PER_QUEUE - 1))
          .catch(() => [] as string[])
      )
    );
    return [...new Set(batches.flat())];
  } catch {
    return [];
  }
}

export async function getMonitoringDashboard(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const barbershopId = (request.user as any).barbershopId;

  const [pendingPayments, pendingFiados, deadJobs, recentErrors] =
    await Promise.all([
      prisma.payment.count({
        where: {
          barbershopId,
          status: 'pending',
          createdAt: { lt: hoursAgo(24) },
        },
      }),
      prisma.fiado.count({
        where: {
          barbershopId,
          status: { in: ['PENDING', 'PARTIAL'] },
        },
      }),
      readDeadJobs(),
      prisma.errorLog.count({
        where: {
          path: { startsWith: '/api' },
          createdAt: { gte: minutesAgo(60) },
        },
      }),
    ]);

  return reply.send({
    pendingPayments,
    pendingFiados,
    deadJobs,
    recentErrors,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
}
