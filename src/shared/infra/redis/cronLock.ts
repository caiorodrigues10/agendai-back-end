import { RedisDistributedLock } from './distributedLock';
import { prisma } from '@/libs/prismaClient';
import { randomUUID } from 'node:crypto';
import type IORedis from 'ioredis';

export interface CronLockOptions {
  /** Lock key = `cron:{jobName}:{scheduledKey}` */
  jobName: string;
  scheduledKey: string;
  /** Default 10 minutes */
  ttlMs?: number;
  /** Default 2 minutes */
  renewIntervalMs?: number;
}

/**
 * Executes a cron job with distributed locking.
 * - Acquires Redis lock before execution
 * - Records in CronRun table for audit
 * - Renews lock during long executions
 * - Idempotent: skips if already running or already completed for this key
 */
export async function withCronLock(
  redis: IORedis,
  options: CronLockOptions,
  fn: () => Promise<void>
): Promise<void> {
  const lockKey = `cron:${options.jobName}:${options.scheduledKey}`;
  const ttlMs = options.ttlMs ?? 600_000; // 10 minutes
  const renewMs = options.renewIntervalMs ?? 120_000; // 2 minutes

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

  // The same scheduled run is intentionally idempotent. A failed run may be
  // retried, but a completed or currently running run must be skipped.
  if (existing?.status === "COMPLETED" || existing?.status === "RUNNING") {
    await lock.release(lockKey, ownerId);
    return;
  }

  // Record cron run, reusing a failed row when this is a retry.
  const runId = existing?.id ?? randomUUID();
  let renewTimer: ReturnType<typeof setInterval> | null = null;

  try {
    if (existing) {
      await prisma.cronRun.update({
        where: { id: runId },
        data: { status: 'RUNNING', startedAt: new Date(), completedAt: null, error: null },
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

    // Start lock renewal
    renewTimer = setInterval(async () => {
      await lock.renew(lockKey, ttlMs, ownerId);
    }, renewMs);

    await fn();

    await prisma.cronRun.update({
      where: { id: runId },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
  } catch (error) {
    await prisma.cronRun.update({
      where: { id: runId },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    });
    throw error;
  } finally {
    if (renewTimer) clearInterval(renewTimer);
    await lock.release(lockKey, ownerId);
  }
}
