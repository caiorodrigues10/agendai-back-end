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

  incr(
    key: string,
    callback: (error: Error | null, result?: { current: number; ttl: number }) => void,
    timeWindow?: number,
  ): void {
    const redis = getRedisConnection();
    const ttlSeconds = Math.ceil((timeWindow ?? this.timeWindow) / 1000);

    redis
      .incr(key)
      .then(async (count) => {
        if (count === 1) {
          await redis.expire(key, ttlSeconds);
        }
        const ttl = await redis.ttl(key);
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
    timeWindow?: number,
  ): void {
    const redis = getRedisConnection();
    const ttlSeconds = Math.ceil((timeWindow ?? this.timeWindow) / 1000);

    redis
      .get(key)
      .then((val) => {
        const current = val ? parseInt(val, 10) : 0;
        callback(null, { current, ttl: ttlSeconds * 1000 });
      })
      .catch((err) => {
        logger.error({ err }, "Redis error in rate-limit read");
        callback(null, { current: 0, ttl: ttlSeconds * 1000 });
      });
  }

  child(routeOptions: { timeWindow?: number; max?: number; method?: string; url?: string }): RedisRateLimitStore {
    const childPrefix = routeOptions.method && routeOptions.url
      ? `${this.prefix}${routeOptions.method}:${routeOptions.url}:`
      : this.prefix;

    return new RedisRateLimitStore({
      timeWindow: routeOptions.timeWindow ?? this.timeWindow,
      max: routeOptions.max,
      prefix: childPrefix,
    });
  }

  decrement(key: string): void {
    const redis = getRedisConnection();
    redis.decr(key).catch((err) => {
      logger.error({ err }, "Redis error in rate-limit decrement");
    });
  }

  reset(key: string): void {
    const redis = getRedisConnection();
    redis.del(key).catch((err) => {
      logger.error({ err }, "Redis error in rate-limit reset");
    });
  }
}
