import { getRedisConnection } from "@/shared/infra/queue/redisConnection";
import { getModuleLogger } from "@/shared/utils/logger";

const logger = getModuleLogger("brute-force");

const THRESHOLDS: [number, number][] = [
  [20, 1800],
  [15, 900],
  [10, 300],
  [5, 60],
];

const lockTimers = new Map<string, NodeJS.Timeout>();

function getLockDuration(count: number): number {
  for (const [threshold, duration] of THRESHOLDS) {
    if (count >= threshold) return duration;
  }
  return 0;
}

function getRemainingTTL(ttlSeconds: number): number {
  return Math.max(0, Math.ceil(ttlSeconds));
}

export async function checkLock(
  email: string,
  ip: string,
): Promise<{ locked: boolean; retryAfterSeconds?: number }> {
  try {
    const redis = getRedisConnection();
    const ttl = await redis.ttl(`login:locked:${email}`);
    if (ttl > 0) {
      return { locked: true, retryAfterSeconds: getRemainingTTL(ttl) };
    }
    return { locked: false };
  } catch (err) {
    logger.error({ err, email, ip }, "Redis error in checkLock, allowing login");
    return { locked: false };
  }
}

export async function recordFailure(
  email: string,
  ip: string,
): Promise<{ locked: boolean; retryAfterSeconds: number }> {
  try {
    const redis = getRedisConnection();
    const attemptKey = `login:attempts:${email}:${ip}`;
    const lockKey = `login:locked:${email}`;

    const count = await redis.incr(attemptKey);
    const duration = getLockDuration(count);

    if (duration > 0) {
      const pipeline = redis.pipeline();
      pipeline.set(lockKey, "1", "EX", duration);
      pipeline.expire(attemptKey, duration);
      await pipeline.exec();

      const existingTimer = lockTimers.get(email);
      if (existingTimer) clearTimeout(existingTimer);

      const timer = setTimeout(() => {
        lockTimers.delete(email);
      }, duration * 1000);
      lockTimers.set(email, timer);

      return { locked: true, retryAfterSeconds: duration };
    }

    await redis.expire(attemptKey, 300);
    return { locked: false, retryAfterSeconds: 0 };
  } catch (err) {
    logger.error({ err, email, ip }, "Redis error in recordFailure, allowing login");
    return { locked: false, retryAfterSeconds: 0 };
  }
}

export async function resetAttempts(
  email: string,
  ip: string,
): Promise<void> {
  try {
    const redis = getRedisConnection();
    const pipeline = redis.pipeline();
    pipeline.del(`login:attempts:${email}:${ip}`);
    pipeline.del(`login:locked:${email}`);
    await pipeline.exec();

    const timer = lockTimers.get(email);
    if (timer) {
      clearTimeout(timer);
      lockTimers.delete(email);
    }
  } catch (err) {
    logger.error({ err, email, ip }, "Redis error in resetAttempts");
  }
}

export function cleanupTimers(): void {
  for (const timer of lockTimers.values()) {
    clearTimeout(timer);
  }
  lockTimers.clear();
}
