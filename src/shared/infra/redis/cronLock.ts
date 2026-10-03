import { RedisDistributedLock } from './distributedLock';
import { prisma } from '@/libs/prismaClient';
import { randomUUID } from 'node:crypto';
import type IORedis from 'ioredis';
import { getModuleLogger } from '@/shared/utils/logger';

const logger = getModuleLogger('redis:cron-lock');

const DEFAULT_TTL_MS = 600_000;
const DEFAULT_RENEW_MS = 120_000;
const DEFAULT_STALE_MS = 900_000;
const LOCK_LOST_ERROR = 'Lock distribuído perdido durante a execução';
const SP_TIMEZONE = 'America/Sao_Paulo';

export interface CronLockOptions {
  /** Lock key = `cron:{jobName}:{scheduledKey}` */
  jobName: string;
  scheduledKey: string;
  /** Default 10 minutes */
  ttlMs?: number;
  /** Default 2 minutes, sempre limitado a ttl/3 */
  renewIntervalMs?: number;
  /** Idade de um CronRun RUNNING além da qual a execução é considerada abandonada. Default 15 minutes. */
  staleAfterMs?: number;
}

export interface CronLockContext {
  /** false quando o lock Redis deixou de ser renovado: não iniciar novos efeitos. */
  isLockHeld(): boolean;
}

function spParts(date: Date): { dateKey: string; hour: string; minute: number } {
  const parts: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat('en-CA', {
    timeZone: SP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)) {
    if (part.type !== 'literal') parts[part.type] = part.value;
  }
  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    hour: parts.hour,
    minute: Number(parts.minute),
  };
}

/** scheduledKey de crons diários: YYYY-MM-DD em America/Sao_Paulo. */
export function spDateKey(date: Date = new Date()): string {
  return spParts(date).dateKey;
}

/** scheduledKey de crons por minuto: YYYY-MM-DD-HH-mm em America/Sao_Paulo. */
export function spMinuteKey(date: Date = new Date()): string {
  const { dateKey, hour, minute } = spParts(date);
  return `${dateKey}-${hour}-${String(minute).padStart(2, '0')}`;
}

/** scheduledKey de crons de intervalo fixo (ex.: a cada 5 minutos): YYYY-MM-DD-HH-<slot> em America/Sao_Paulo. */
export function spSlotKey(intervalMinutes: number, date: Date = new Date()): string {
  const { dateKey, hour, minute } = spParts(date);
  const slot = Math.floor(minute / intervalMinutes) * intervalMinutes;
  return `${dateKey}-${hour}-${String(slot).padStart(2, '0')}`;
}

/**
 * Executes a cron job with distributed locking.
 * - Acquires Redis lock before execution; without it nothing runs
 * - Records in CronRun table for audit
 * - Renews lock during long executions; a lost renewal blocks further effects
 * - Skips COMPLETED runs and RUNNING runs whose lease is still fresh
 * - Resumes RUNNING runs abandoned beyond `staleAfterMs` (auditado via logger)
 */
export async function withCronLock(
  redis: IORedis,
  options: CronLockOptions,
  fn: (ctx: CronLockContext) => Promise<void>
): Promise<void> {
  const lockKey = `cron:${options.jobName}:${options.scheduledKey}`;
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const renewMs = Math.min(
    options.renewIntervalMs ?? DEFAULT_RENEW_MS,
    Math.max(10_000, Math.floor(ttlMs / 3))
  );
  const staleAfterMs = options.staleAfterMs ?? DEFAULT_STALE_MS;

  const lock = new RedisDistributedLock(redis);
  const ownerId = await lock.acquire(lockKey, ttlMs);

  if (!ownerId) {
    // Another instance holds the lock
    return;
  }

  let existing;
  try {
    existing = await prisma.cronRun.findUnique({
      where: {
        jobName_scheduledKey: {
          jobName: options.jobName,
          scheduledKey: options.scheduledKey,
        },
      },
    });
  } catch (error) {
    await lock.release(lockKey, ownerId);
    throw error;
  }

  const abandonedForMs =
    existing?.status === 'RUNNING' ? Date.now() - existing.startedAt.getTime() : 0;
  const abandoned = existing?.status === 'RUNNING' && abandonedForMs > staleAfterMs;

  // The same scheduled run is intentionally idempotent. A failed run may be
  // retried, a currently running run must be skipped — unless it outlived its
  // lease, which means the holder died without releasing anything.
  if (existing?.status === 'COMPLETED' || (existing?.status === 'RUNNING' && !abandoned)) {
    await lock.release(lockKey, ownerId);
    return;
  }

  const runId = existing?.id ?? randomUUID();
  let renewTimer: ReturnType<typeof setInterval> | null = null;
  let lockLost = false;
  const ctx: CronLockContext = { isLockHeld: () => !lockLost };

  const markRun = async (data: {
    status: string;
    completedAt?: Date;
    error?: string | null;
  }): Promise<void> => {
    try {
      await prisma.cronRun.update({ where: { id: runId }, data });
    } catch (err) {
      logger.error(
        { err, jobName: options.jobName, scheduledKey: options.scheduledKey, runId, status: data.status },
        'Falha ao gravar status do CronRun'
      );
    }
  };

  try {
    if (existing) {
      const resumeNotice = abandoned
        ? `RETOMADA: RUNNING abandonado desde ${existing.startedAt.toISOString()} (lease de ${Math.round(
            staleAfterMs / 60_000
          )} min expirado)`
        : null;
      await prisma.cronRun.update({
        where: { id: runId },
        data: {
          status: 'RUNNING',
          startedAt: new Date(),
          completedAt: null,
          error: resumeNotice,
        },
      });
    } else {
      await prisma.cronRun.create({
        data: {
          id: runId,
          jobName: options.jobName,
          scheduledKey: options.scheduledKey,
          status: 'RUNNING',
          startedAt: new Date(),
        },
      });
    }

    if (abandoned) {
      logger.warn(
        {
          jobName: options.jobName,
          scheduledKey: options.scheduledKey,
          runId,
          abandonedForMs,
          staleAfterMs,
          previousStartedAt: existing?.startedAt,
          resumeReason: 'stale_running',
        },
        'Retomando execução de cron abandonada'
      );
    }

    renewTimer = setInterval(async () => {
      try {
        const renewed = await lock.renew(lockKey, ttlMs, ownerId);
        if (renewed) return;
        lockLost = true;
        logger.error(
          { jobName: options.jobName, scheduledKey: options.scheduledKey, lockKey },
          'Lock de cron não pôde ser renovado — novos efeitos interrompidos'
        );
      } catch (err) {
        lockLost = true;
        logger.error(
          { err, jobName: options.jobName, scheduledKey: options.scheduledKey, lockKey },
          'Falha ao renovar lock de cron — novos efeitos interrompidos'
        );
      }
    }, renewMs);

    try {
      await fn(ctx);
    } catch (error) {
      await markRun({
        status: 'FAILED',
        completedAt: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }

    if (lockLost) {
      await markRun({ status: 'FAILED', completedAt: new Date(), error: LOCK_LOST_ERROR });
      throw new Error(LOCK_LOST_ERROR);
    }

    await markRun({ status: 'COMPLETED', completedAt: new Date() });
  } finally {
    if (renewTimer) clearInterval(renewTimer);
    await lock.release(lockKey, ownerId);
  }
}
