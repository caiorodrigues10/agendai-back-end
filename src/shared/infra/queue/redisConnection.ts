/**
 * Conexão Redis compartilhada para BullMQ (lazy).
 * Em VITEST não instancia IORedis — evita ECONNREFUSED nos unit tests.
 *
 * Env: REDIS_URL (default: redis://localhost:6379)
 */
import IORedis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

let _redis: IORedis | null = null;

export function getRedisConnection(): IORedis {
  if (process.env.VITEST) {
    throw new Error(
      "Redis não deve ser usado em unit tests — mocke enqueueWhatsApp/enqueueEmail"
    );
  }
  if (!_redis) {
    _redis = new IORedis(REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy(times: number) {
        if (times > 10) return null;
        return Math.min(times * 200, 5000);
      },
      tls: REDIS_URL.startsWith("rediss://") ? {} : undefined,
    });
    _redis.on("error", (err) => {
      console.error("[Redis] Erro de conexão:", err.message);
    });
  }
  return _redis;
}

/**
 * Compat: lazy proxy. Prefer getRedisConnection() em código novo.
 * Acesso em VITEST lança ao usar (não no import).
 */
export const redisConnection: IORedis = new Proxy({} as IORedis, {
  get(_target, prop, receiver) {
    const conn = getRedisConnection();
    const value = Reflect.get(conn, prop, receiver);
    return typeof value === "function" ? value.bind(conn) : value;
  },
});
