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

  private key(routeKey: string, key: string): string {
    return `${this.prefix}${routeKey}:${key}`;
  }

  async increment(key: string): Promise<{ count: number; ttl: number }> {
    try {
      const redis = getRedisConnection();
      const count = await redis.incr(key);
      if (count === 1) {
        const expiry = Math.ceil(this.timeWindow / 1000);
        await redis.expire(key, expiry);
      }
      const remaining = await redis.ttl(key);
      return { count, ttl: Math.max(0, remaining) };
    } catch (err) {
      logger.error({ err }, "Redis error in rate-limit increment, allowing request");
      return { count: 1, ttl: Math.ceil(this.timeWindow / 1000) };
    }
  }

  async decrement(key: string): Promise<void> {
    try {
      const redis = getRedisConnection();
      await redis.decr(key);
    } catch (err) {
      logger.error({ err }, "Redis error in rate-limit decrement");
    }
  }

  child(override: { timeWindow?: number; max?: number; prefix?: string }): RedisRateLimitStore {
    return new RedisRateLimitStore({
      timeWindow: override.timeWindow ?? this.timeWindow,
      max: override.max,
      prefix: override.prefix ?? this.prefix,
    });
  }

  async reset(key: string): Promise<void> {
    try {
      const redis = getRedisConnection();
      await redis.del(key);
    } catch (err) {
      logger.error({ err }, "Redis error in rate-limit reset");
    }
  }
}
