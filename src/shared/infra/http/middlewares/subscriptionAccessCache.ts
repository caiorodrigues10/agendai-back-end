/**
 * Cache Redis do checkSubscription — módulo isolado para
 * permitir invalidação no webhook sem dependência circular.
 *
 * Redis indisponível ⇒ degrada para cache local com single-flight:
 * a leitura no banco fica limitada a 1 em andamento por salão e o valor
 * gravado é sempre o decidido pelo banco (fail-closed preservado).
 */
import { getApiRedisConnection } from "@/shared/infra/queue/redisConnection";
import { getModuleLogger } from "@/shared/utils/logger";

const logger = getModuleLogger("subscription-cache");

const CACHE_PREFIX = "subscription:access:";
export const SUBSCRIPTION_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos
export const SUBSCRIPTION_CACHE_TTL_SECONDS = 300; // 5 minutos

const MISS_WAIT_MS = 2_000;

type FallbackEntry = { value: boolean; expiresAt: number };
type PendingRead = {
  promise: Promise<boolean | null>;
  resolve: (value: boolean | null) => void;
  timer: ReturnType<typeof setTimeout>;
};

const fallbackCache = new Map<string, FallbackEntry>();
const pendingReads = new Map<string, PendingRead>();

let degraded = false;

function markDegraded(err: unknown): void {
  if (degraded) return;
  degraded = true;
  logger.warn({ err }, "Cache de assinatura indisponível — usando cache local");
}

function markHealthy(): void {
  if (!degraded) return;
  degraded = false;
  logger.info("Cache de assinatura restaurado");
}

async function getRedis() {
  try {
    return getApiRedisConnection();
  } catch {
    return null;
  }
}

function settlePending(barbershopId: string, value: boolean | null): void {
  const pending = pendingReads.get(barbershopId);
  if (!pending) return;
  clearTimeout(pending.timer);
  pendingReads.delete(barbershopId);
  pending.resolve(value);
}

function readFallback(barbershopId: string): boolean | null {
  const entry = fallbackCache.get(barbershopId);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    fallbackCache.delete(barbershopId);
    return null;
  }
  return entry.value;
}

async function readThroughFallback(barbershopId: string): Promise<boolean | null> {
  const cached = readFallback(barbershopId);
  if (cached !== null) return cached;

  const pending = pendingReads.get(barbershopId);
  if (pending) return pending.promise;

  let resolve!: (value: boolean | null) => void;
  const promise = new Promise<boolean | null>((r) => {
    resolve = r;
  });
  const timer = setTimeout(() => {
    pendingReads.delete(barbershopId);
    resolve(null);
  }, MISS_WAIT_MS);
  timer.unref?.();
  pendingReads.set(barbershopId, { promise, resolve, timer });
  return null;
}

export async function getCachedAccess(barbershopId: string): Promise<boolean | null> {
  const redis = await getRedis();
  if (redis) {
    try {
      const value = await redis.get(`${CACHE_PREFIX}${barbershopId}`);
      markHealthy();
      if (value === null) return null;
      return value === "1";
    } catch (err) {
      markDegraded(err);
    }
  }

  return readThroughFallback(barbershopId);
}

export async function setCachedAccess(barbershopId: string, allowed: boolean): Promise<void> {
  const redis = await getRedis();
  if (redis) {
    try {
      await redis.set(`${CACHE_PREFIX}${barbershopId}`, allowed ? "1" : "0", "EX", SUBSCRIPTION_CACHE_TTL_SECONDS);
      markHealthy();
      fallbackCache.delete(barbershopId);
      settlePending(barbershopId, allowed);
      return;
    } catch (err) {
      markDegraded(err);
    }
  }

  fallbackCache.set(barbershopId, { value: allowed, expiresAt: Date.now() + SUBSCRIPTION_CACHE_TTL_MS });
  settlePending(barbershopId, allowed);
}

export async function invalidateSubscriptionCache(barbershopId: string): Promise<void> {
  fallbackCache.delete(barbershopId);
  const redis = await getRedis();
  if (!redis) return;

  try {
    await redis.del(`${CACHE_PREFIX}${barbershopId}`);
    markHealthy();
  } catch (err) {
    markDegraded(err);
  }
}

export async function refreshSubscriptionCache(barbershopId: string): Promise<void> {
  const redis = await getRedis();
  if (redis) {
    try {
      const exists = await redis.exists(`${CACHE_PREFIX}${barbershopId}`);
      if (exists) {
        await redis.expire(`${CACHE_PREFIX}${barbershopId}`, SUBSCRIPTION_CACHE_TTL_SECONDS);
      }
      markHealthy();
      return;
    } catch (err) {
      markDegraded(err);
    }
  }

  const entry = fallbackCache.get(barbershopId);
  if (entry && entry.expiresAt > Date.now()) {
    fallbackCache.set(barbershopId, { ...entry, expiresAt: Date.now() + SUBSCRIPTION_CACHE_TTL_MS });
  }
}
