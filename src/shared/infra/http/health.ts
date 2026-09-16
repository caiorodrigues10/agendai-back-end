import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '@/libs/prismaClient';
import { getRedisConnection } from '@/shared/infra/queue/redisConnection';
import { getProcessRole } from '@/shared/config/processRole';
import { getStorageHealthStatus } from '@/shared/utils/storageHealth';

async function checkMigrations(): Promise<{ status: string; pending: number }> {
  try {
    const pending = await prisma.$queryRaw`
      SELECT COUNT(*)::int as count FROM _prisma_migrations
      WHERE finished_at IS NULL
    `;
    const count = (pending as any[])[0]?.count ?? 0;
    return { status: count === 0 ? 'ok' : 'pending', pending: count };
  } catch {
    return { status: 'error', pending: -1 };
  }
}

/**
 * Health check endpoints:
 * - /health: process alive + dependency status (DB, Redis)
 * - /ready: readiness probe (200 if all ok, 503 otherwise)
 */
export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async (_request: FastifyRequest, reply: FastifyReply) => {
    const dbHealthy = await checkDatabase();
    const redisHealthy = await checkRedis();
    const migrations = await checkMigrations();
    const storage = getStorageHealthStatus();

    // Storage degradado só se NENHUM provider estiver disponível.
    // GCS indisponível + Cloudinary ativo = sistema saudável (fallback operacional).
    const allDepsOk = dbHealthy && redisHealthy && storage.status === 'ok';

    reply.send({
      status: allDepsOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      role: getProcessRole(),
      checks: {
        postgres: dbHealthy ? 'healthy' : 'unhealthy',
        redis: redisHealthy ? 'healthy' : 'unhealthy',
        migrations,
        storage: {
          status: storage.status === 'ok' ? 'healthy' : 'degraded',
          provider: storage.active_provider,
          primary_available: storage.primary_available,
          fallback_available: storage.fallback_available,
        },
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

    // Check Migrations
    const migrationsStart = Date.now();
    const migrations = await checkMigrations();
    checks.migrations = {
      status: migrations.status === 'ok' ? 'ok' : 'error',
      latencyMs: Date.now() - migrationsStart,
      ...(migrations.status === 'pending' ? { pending: migrations.pending } : {}),
    };

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
  } catch (err) {
    // Em unit tests (VITEST sem ALLOW_TEST_REDIS), Redis não está disponível.
    // Não degrada o health — a aplicação funciona sem Redis nesse contexto.
    if (process.env.VITEST && !process.env.ALLOW_TEST_REDIS) return true;
    return false;
  }
}
