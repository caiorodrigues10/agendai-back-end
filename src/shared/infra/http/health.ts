import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '@/libs/prismaClient';
import { getRedisConnection } from '@/shared/infra/queue/redisConnection';
import { getProcessRole } from '@/shared/config/processRole';
import { getStorageHealthStatus } from '@/shared/utils/storageHealth';
import { AppError } from '@/shared/errors/AppError';
import { getModuleLogger } from '@/shared/utils/logger';

const logger = getModuleLogger('health');

const CHECK_DEADLINE_MS = 3_000;
const READY_CACHE_TTL_MS = 2_500;
const MIGRATIONS_CACHE_TTL_MS = 60_000;
const MIGRATIONS_MIN_REFRESH_MS = 5_000;

type MigrationsStatus = { status: 'ok' | 'pending' | 'error'; pending: number };
type DependencyCheck = { status: 'ok' | 'error'; latencyMs: number; error?: string };
type ReadyPayload = {
  status: 'ready' | 'not_ready';
  checks: { postgres: DependencyCheck; redis: DependencyCheck };
  timestamp: string;
};

let migrationsCache: { value: MigrationsStatus; checkedAt: number } | null = null;
let migrationsInFlight: Promise<MigrationsStatus> | null = null;
let readyCache: { checkedAt: number; statusCode: number; payload: ReadyPayload } | null = null;

/**
 * Health check endpoints:
 * - /live: liveness (processo vivo, sem dependências externas)
 * - /ready: readiness (Postgres + Redis, com deadline e cache curto)
 * - /health: diagnóstico informativo legado (sempre 200)
 * - /internal/health: diagnóstico detalhado protegido
 */
export async function healthRoutes(app: FastifyInstance) {
  void getMigrationsStatus({ refresh: true }).catch(() => undefined);

  app.get('/live', async (_request: FastifyRequest, reply: FastifyReply) => {
    reply.send({ status: 'live', timestamp: new Date().toISOString() });
  });

  app.get('/health', async (_request: FastifyRequest, reply: FastifyReply) => {
    const [postgres, redis, migrations] = await Promise.all([
      checkPostgres(),
      checkRedis(),
      getMigrationsStatus(),
    ]);
    const storage = getStorageHealthStatus();

    const postgresHealthy = postgres.status === 'ok';
    const redisHealthy = redis.status === 'ok';
    const allDepsOk =
      postgresHealthy && redisHealthy && storage.status === 'ok' && migrations.status === 'ok';

    reply.send({
      status: allDepsOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      checks: {
        postgres: postgresHealthy ? 'healthy' : 'unhealthy',
        db: postgresHealthy ? 'healthy' : 'unhealthy',
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
    const cached = readyCache;
    if (cached && Date.now() - cached.checkedAt < READY_CACHE_TTL_MS) {
      reply.code(cached.statusCode).send(cached.payload);
      return;
    }

    const [postgres, redis] = await Promise.all([checkPostgres(), checkRedis()]);
    const allOk = postgres.status === 'ok' && redis.status === 'ok';

    const payload: ReadyPayload = {
      status: allOk ? 'ready' : 'not_ready',
      checks: { postgres, redis },
      timestamp: new Date().toISOString(),
    };
    const statusCode = allOk ? 200 : 503;

    readyCache = { checkedAt: Date.now(), statusCode, payload };
    reply.code(statusCode).send(payload);
  });

  app.get('/internal/health', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isInternalHealthAuthorized(request)) {
      throw new AppError('Acesso não autorizado', 401);
    }

    const [postgres, redis, migrations] = await Promise.all([
      checkPostgres(),
      checkRedis(),
      getMigrationsStatus({ refresh: isRefreshRequested(request) }),
    ]);
    const storage = getStorageHealthStatus();

    const allOk =
      postgres.status === 'ok' &&
      redis.status === 'ok' &&
      migrations.status === 'ok' &&
      storage.status === 'ok';

    reply.send({
      status: allOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      role: getProcessRole(),
      migrationsCheckedAt: migrationsCache
        ? new Date(migrationsCache.checkedAt).toISOString()
        : null,
      checks: {
        postgres,
        redis,
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
}

async function withDeadline<T>(
  operation: () => Promise<T>,
  label: string,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} excedeu ${CHECK_DEADLINE_MS}ms`)),
          CHECK_DEADLINE_MS,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function checkPostgres(): Promise<DependencyCheck> {
  const start = Date.now();
  try {
    await withDeadline(() => prisma.$queryRaw`SELECT 1`, 'postgres');
    return { status: 'ok', latencyMs: Date.now() - start };
  } catch (err) {
    return {
      status: 'error',
      latencyMs: Date.now() - start,
      error: errorMessage(err),
    };
  }
}

async function checkRedis(): Promise<DependencyCheck> {
  const start = Date.now();
  try {
    const pong = await withDeadline(async () => {
      const redis = getRedisConnection();
      return redis.ping();
    }, 'redis');

    if (pong !== 'PONG') {
      throw new Error(`resposta inesperada do PING: ${String(pong)}`);
    }
    return { status: 'ok', latencyMs: Date.now() - start };
  } catch (err) {
    if (process.env.VITEST && !process.env.ALLOW_TEST_REDIS) {
      return { status: 'ok', latencyMs: Date.now() - start };
    }
    return {
      status: 'error',
      latencyMs: Date.now() - start,
      error: errorMessage(err),
    };
  }
}

async function getMigrationsStatus(
  options: { refresh?: boolean } = {},
): Promise<MigrationsStatus> {
  const cached = migrationsCache;
  if (cached) {
    const age = Date.now() - cached.checkedAt;
    const usable = options.refresh
      ? age >= MIGRATIONS_MIN_REFRESH_MS
      : age < MIGRATIONS_CACHE_TTL_MS;
    if (usable) return cached.value;
  }

  if (!migrationsInFlight) {
    migrationsInFlight = runMigrationsCheck()
      .then((value) => {
        migrationsCache = { value, checkedAt: Date.now() };
        return value;
      })
      .catch((err) => {
        logger.error({ err }, 'falha ao verificar migrations');
        const value: MigrationsStatus = { status: 'error', pending: -1 };
        migrationsCache = { value, checkedAt: Date.now() };
        return value;
      })
      .finally(() => {
        migrationsInFlight = null;
      });
  }

  return migrationsInFlight;
}

async function runMigrationsCheck(): Promise<MigrationsStatus> {
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

    const unfinished = rows.filter(
      (row: { finished_at: Date | null; rolled_back_at: Date | null }) =>
        row.finished_at == null && row.rolled_back_at == null,
    ).length;
    const applied = new Set(
      rows
        .filter(
          (row: { finished_at: Date | null; rolled_back_at: Date | null }) =>
            row.finished_at && !row.rolled_back_at,
        )
        .map((row: { migration_name: string }) => row.migration_name),
    );
    const missing = folders.filter((folder) => !applied.has(folder)).length;
    const pending = unfinished + missing;
    return { status: pending === 0 ? 'ok' : 'pending', pending };
  } catch {
    return { status: 'error', pending: -1 };
  }
}

function isRefreshRequested(request: FastifyRequest): boolean {
  const query = request.query as { refresh?: unknown } | undefined;
  return query?.refresh === '1' || query?.refresh === 'true';
}

function isInternalHealthAuthorized(request: FastifyRequest): boolean {
  if (isLoopbackAddress(peerAddress(request))) return true;

  const expected = process.env.INTERNAL_HEALTH_TOKEN;
  if (!expected) return false;

  const provided = request.headers['x-internal-health-token'];
  if (typeof provided !== 'string') return false;
  return constantTimeEquals(provided, expected);
}

function peerAddress(request: FastifyRequest): string | undefined {
  return request.raw?.socket?.remoteAddress ?? request.ip;
}

function isLoopbackAddress(address?: string): boolean {
  if (!address) return false;
  const value = address.replace(/^::ffff:/i, '').toLowerCase();
  return value === '::1' || value === '127.0.0.1' || value.startsWith('127.');
}

function constantTimeEquals(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Erro desconhecido';
}
