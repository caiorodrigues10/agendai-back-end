import { getRedisConnection } from "@/shared/infra/queue/redisConnection";
import { getModuleLogger } from "@/shared/utils/logger";

const logger = getModuleLogger("brute-force");

const isDev = process.env.NODE_ENV !== "production";

// Em dev: limites bem mais permissivos para não atrapalhar o ciclo de testes.
// Em production: thresholds rígidos conforme LGPD/OWASP.
const THRESHOLDS: [number, number][] = isDev
  ? [
      [100, 30],   // >= 100 falhas -> 30s lockout
      [50, 15],    // >= 50 falhas  -> 15s lockout
      [20, 10],    // >= 20 falhas  -> 10s lockout
      [10, 5],     // >= 10 falhas  -> 5s lockout
    ]
  : [
      [20, 1800],  // >= 20 falhas -> 1800s lockout (30 min)
      [15, 900],   // >= 15 falhas -> 900s lockout (15 min)
      [10, 300],   // >= 10 falhas -> 300s lockout (5 min)
      [5, 60],     // >= 5 falhas  -> 60s lockout (1 min)
    ];

// TTL do counter de tentativas abaixo do threshold (5 min em prod, 30s em dev)
const SUB_THRESHOLD_TTL = isDev ? 30 : 300;

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

    await redis.expire(attemptKey, SUB_THRESHOLD_TTL);
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

/**
 * Remove o lock e todos os counters de tentativas para um email
 * (independente do IP). Usado pelo endpoint de reset em dev.
 */
export async function resetByEmail(email: string): Promise<void> {
  try {
    const redis = getRedisConnection();
    await redis.del(`login:locked:${email}`);

    // Limpar todos os keys de tentativas que combinem com o email
    const pattern = `login:attempts:${email}:*`;
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      const pipeline = redis.pipeline();
      for (const key of keys) {
        pipeline.del(key);
      }
      await pipeline.exec();
    }

    const timer = lockTimers.get(email);
    if (timer) {
      clearTimeout(timer);
      lockTimers.delete(email);
    }
  } catch (err) {
    logger.error({ err, email }, "Redis error in resetByEmail");
  }
}

/**
 * Remove o lock e todos os counters de tentativas para um IP
 * (independente do email). Usado pelo endpoint de reset em dev.
 */
export async function resetByIp(ip: string): Promise<void> {
  try {
    const redis = getRedisConnection();

    // Limpar todos os keys de tentativas que combinem com o IP
    const pattern = `login:attempts:*:${ip}`;
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      const pipeline = redis.pipeline();
      for (const key of keys) {
        pipeline.del(key);
        // Extrair email do key para limpar o lock também
        const email = key.split(":")[2];
        if (email) {
          pipeline.del(`login:locked:${email}`);
          const timer = lockTimers.get(email);
          if (timer) {
            clearTimeout(timer);
            lockTimers.delete(email);
          }
        }
      }
      await pipeline.exec();
    }
  } catch (err) {
    logger.error({ err, ip }, "Redis error in resetByIp");
  }
}

export function cleanupTimers(): void {
  for (const timer of lockTimers.values()) {
    clearTimeout(timer);
  }
  lockTimers.clear();
}
