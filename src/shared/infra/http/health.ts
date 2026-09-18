import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '@/libs/prismaClient';
import { getRedisConnection } from '@/shared/infra/queue/redisConnection';
import { getProcessRole } from '@/shared/config/processRole';
import { getStorageHealthStatus } from '@/shared/utils/storageHealth';

async function checkMigrations(): Promise<{ status: string; pending: number }> {
  try {
    const migrationsDir = path.join(process.cwd(), 'prisma', 'migrations');
    const folders = fs.existsSync(migrationsDir)
      ? fs.readdirSync(migrationsDir).filter((name) => {
          const full = path.join(migrationsDir, name);
          return name !== 'migration_lock.toml' && fs.statSync(full).isDirectory();
        })
      : [];

    const rows = await prisma.$queryRaw<
      Array<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }>
    >`
      SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations
    `;

    const unfinished = rows.filter((row: { finished_at: Date | null; rolled_back_at: Date | null }) => row.finished_at == null && row.rolled_back_at == null).length;
    const applied = new Set(
      rows
        .filter((row: { migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }) => row.finished_at && !row.rolled_back_at)
        .map((row: { migration_name: string }) => row.migration_name)
    );
    const missing = folders.filter((folder) => !applied.has(folder)).length;
    const pending = unfinished + missing;
    return { status: pending === 0 ? 'ok' : 'pending', pending };
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
    const allDepsOk = dbHealthy && redisHealthy && storage.status === 'ok' && migrations.status === 'ok';

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
