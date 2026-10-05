import { getRedisConnection } from "@/shared/infra/queue/redisConnection";
import { getModuleLogger } from "@/shared/utils/logger";

const logger = getModuleLogger("rate-limit-redis");

export class RedisRateLimitStore {
  private readonly prefix: string;
  private readonly timeWindow: number;

  constructor(opts: { timeWindow?: number; max?: number; prefix?: string }) {
    this.prefix = opts.prefix ?? "rl:";
    this.timeWindow = opts.timeWindow ?? 60_000;
  }

  /**
   * Interface exigida por @fastify/rate-limit: incr(key, cb, max, ban).
   * A janela de tempo é sempre a do store (`timeWindow`); o 3º argumento é o
   * `max` da rota e não deve ser confundido com o TTL. A chave precisa receber
   * o `prefix` (rl:METHOD:url:) para que os contadores das rotas não se cruzem.
   */
  incr(
    key: string,
    callback: (error: Error | null, result?: { current: number; ttl: number }) => void,
    _max?: number,
  ): void {
    const redis = getRedisConnection();
    const redisKey = `${this.prefix}${key}`;
    const ttlSeconds = Math.ceil(this.timeWindow / 1000);

    redis
      .incr(redisKey)
      .then(async (count) => {
        if (count === 1) {
          await redis.expire(redisKey, ttlSeconds);
        }
        const ttl = await redis.ttl(redisKey);
        callback(null, { current: count, ttl: Math.max(0, ttl) * 1000 });
      })
      .catch((err) => {
        logger.error({ err }, "Redis error in rate-limit incr, allowing request");
        callback(null, { current: 1, ttl: ttlSeconds * 1000 });
      });
  }

  read(
    key: string,
    callback: (error: Error | null, result?: { current: number; ttl: number }) => void,
  ): void {
    const redis = getRedisConnection();
    const redisKey = `${this.prefix}${key}`;
    const ttlSeconds = Math.ceil(this.timeWindow / 1000);

    redis
      .get(redisKey)
      .then((val) => {
        const current = val ? parseInt(val, 10) : 0;
        callback(null, { current, ttl: ttlSeconds * 1000 });
      })
      .catch((err) => {
        logger.error({ err }, "Redis error in rate-limit read");
        callback(null, { current: 0, ttl: ttlSeconds * 1000 });
      });
  }

  child(routeOptions: {
    timeWindow?: number;
    max?: number;
    method?: string;
    url?: string;
    routeInfo?: { method?: string; url?: string };
  }): RedisRateLimitStore {
    // @fastify/rate-limit repassa method/url dentro de `routeInfo` (do onRoute).
    const method = routeOptions.routeInfo?.method ?? routeOptions.method;
    const url = routeOptions.routeInfo?.url ?? routeOptions.url;
    const childPrefix = method && url ? `${this.prefix}${method}:${url}:` : this.prefix;

    return new RedisRateLimitStore({
      timeWindow: routeOptions.timeWindow ?? this.timeWindow,
      max: routeOptions.max,
      prefix: childPrefix,
    });
  }

  decrement(key: string): void {
    const redis = getRedisConnection();
    redis.decr(`${this.prefix}${key}`).catch((err) => {
      logger.error({ err }, "Redis error in rate-limit decrement");
    });
  }

  reset(key: string): void {
    const redis = getRedisConnection();
    redis.del(`${this.prefix}${key}`).catch((err) => {
      logger.error({ err }, "Redis error in rate-limit reset");
    });
  }
}
