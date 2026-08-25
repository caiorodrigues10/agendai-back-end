/**
 * Cache Redis do checkSubscription — módulo isolado para
 * permitir invalidação no webhook sem dependência circular.
 */
import { getRedisConnection } from "@/shared/infra/queue/redisConnection";

const CACHE_PREFIX = "subscription:access:";
export const SUBSCRIPTION_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos
export const SUBSCRIPTION_CACHE_TTL_SECONDS = 300; // 5 minutos

async function getRedis() {
  try {
    return getRedisConnection();
  } catch {
    return null;
  }
}

export async function getCachedAccess(barbershopId: string): Promise<boolean | null> {
  const redis = await getRedis();
  if (!redis) return null;

  const value = await redis.get(`${CACHE_PREFIX}${barbershopId}`);
  if (value === null) return null;
  return value === "1";
}

export async function setCachedAccess(barbershopId: string, allowed: boolean): Promise<void> {
  const redis = await getRedis();
  if (!redis) return;

  await redis.set(`${CACHE_PREFIX}${barbershopId}`, allowed ? "1" : "0", "EX", SUBSCRIPTION_CACHE_TTL_SECONDS);
}

export async function invalidateSubscriptionCache(barbershopId: string): Promise<void> {
  const redis = await getRedis();
  if (!redis) return;

  await redis.del(`${CACHE_PREFIX}${barbershopId}`);
}

export async function refreshSubscriptionCache(barbershopId: string): Promise<void> {
  const redis = await getRedis();
  if (!redis) return;

  const exists = await redis.exists(`${CACHE_PREFIX}${barbershopId}`);
  if (exists) {
    await redis.expire(`${CACHE_PREFIX}${barbershopId}`, SUBSCRIPTION_CACHE_TTL_SECONDS);
  }
}
