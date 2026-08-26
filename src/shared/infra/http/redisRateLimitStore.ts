import type { Store } from "@fastify/rate-limit";
import { getRedisConnection } from "@/shared/infra/queue/redisConnection";
import { getModuleLogger } from "@/shared/utils/logger";

const logger = getModuleLogger("rate-limit-redis");

export class RedisRateLimitStore implements Store {
  private readonly prefix: string;
  private readonly windowMs: number;

  constructor(opts: { prefix?: string; windowMs: number }) {
    this.prefix = opts.prefix ?? "rl:";
    this.windowMs = opts.windowMs;
  }

  private key(routeKey: string, key: string): string {
    return `${this.prefix}${routeKey}:${key}`;
  }

  async increment(
    routeKey: string,
    key: string,
    windowMs: number,
    ttl?: number,
  ): Promise<{ count: number; ttl: number }> {
    try {
      const redis = getRedisConnection();
      const redisKey = this.key(routeKey, key);
      const count = await redis.incr(redisKey);
      if (count === 1) {
        const expiry = Math.ceil((ttl ?? windowMs) / 1000);
        await redis.expire(redisKey, expiry);
      }
      const remaining = await redis.ttl(redisKey);
      return { count, ttl: Math.max(0, remaining) };
    } catch (err) {
      logger.error({ err }, "Redis error in rate-limit increment, allowing request");
      return { count: 1, ttl: Math.ceil(windowMs / 1000) };
    }
  }

  async decrement(routeKey: string, key: string): Promise<void> {
    try {
      const redis = getRedisConnection();
      await redis.decr(this.key(routeKey, key));
    } catch (err) {
      logger.error({ err }, "Redis error in rate-limit decrement");
    }
  }

  async reset(routeKey: string, key: string): Promise<void> {
    try {
      const redis = getRedisConnection();
      await redis.del(this.key(routeKey, key));
    } catch (err) {
      logger.error({ err }, "Redis error in rate-limit reset");
    }
  }
}
