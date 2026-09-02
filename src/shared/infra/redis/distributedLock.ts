import { randomUUID } from 'node:crypto';
import type IORedis from 'ioredis';

export interface DistributedLock {
  acquire(key: string, ttlMs: number): Promise<string | null>;
  renew(key: string, ttlMs: number, ownerId: string): Promise<boolean>;
  release(key: string, ownerId: string): Promise<boolean>;
}

/**
 * Redis-based distributed lock using SET NX PX.
 * - Atomic acquire via SET NX PX (set if not exists, with expiry)
 * - Release via Lua compare-and-delete
 * - Renew via Lua compare-and-renew
 */
export class RedisDistributedLock implements DistributedLock {
  private redis: IORedis;

  constructor(redisClient: IORedis) {
    this.redis = redisClient;
  }

  async acquire(key: string, ttlMs: number): Promise<string | null> {
    const ownerId = randomUUID();
    const result = await this.redis.set(key, ownerId, 'PX', ttlMs, 'NX');
    return result === 'OK' ? ownerId : null;
  }

  async renew(key: string, ttlMs: number, ownerId: string): Promise<boolean> {
    const script = `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("PEXPIRE", KEYS[1], ARGV[2])
      else
        return 0
      end
    `;
    const result = await this.redis.eval(script, 1, key, ownerId, String(ttlMs));
    return result === 1;
  }

  async release(key: string, ownerId: string): Promise<boolean> {
    const script = `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("DEL", KEYS[1])
      else
        return 0
      end
    `;
    const result = await this.redis.eval(script, 1, key, ownerId);
    return result === 1;
  }
}
