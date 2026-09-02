import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '@/libs/prismaClient';
import { getRedisConnection } from '@/shared/infra/queue/redisConnection';
import { getProcessRole } from '@/shared/config/processRole';

/**
 * Health check endpoints:
 * - /health: process alive + dependency status (DB, Redis)
 * - /ready: readiness probe (200 if all ok, 503 otherwise)
 */
export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async (_request: FastifyRequest, reply: FastifyReply) => {
    const dbHealthy = await checkDatabase();
    const redisHealthy = await checkRedis();

    reply.send({
      status: dbHealthy && redisHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      role: getProcessRole(),
      checks: {
        postgres: dbHealthy ? 'healthy' : 'unhealthy',
        redis: redisHealthy ? 'healthy' : 'unhealthy',
      },
    });
  });

  app.get('/ready', async (_request: FastifyRequest, reply: FastifyReply) => {
    const checks: Record<string, { status: string; latencyMs?: number; error?: string }> = {};

    // Check PostgreSQL
    const dbStart = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.postgres = { status: 'ok', latencyMs: Date.now() - dbStart };
    } catch (err) {
      checks.postgres = {
        status: 'error',
        latencyMs: Date.now() - dbStart,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }

    // Check Redis
    const redisStart = Date.now();
    try {
      const redis = getRedisConnection();
      await redis.ping();
      checks.redis = { status: 'ok', latencyMs: Date.now() - redisStart };
    } catch (err) {
      checks.redis = {
        status: 'error',
        latencyMs: Date.now() - redisStart,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }

    const allOk = Object.values(checks).every(c => c.status === 'ok');
    const statusCode = allOk ? 200 : 503;

    reply.code(statusCode).send({
      status: allOk ? 'ready' : 'not_ready',
      checks,
      timestamp: new Date().toISOString(),
    });
  });
}

async function checkDatabase(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

async function checkRedis(): Promise<boolean> {
  try {
    const redis = getRedisConnection();
    const pong = await redis.ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
}
