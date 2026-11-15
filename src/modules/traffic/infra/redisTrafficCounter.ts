import { randomBytes } from "node:crypto";
import { injectable } from "tsyringe";
import type IORedis from "ioredis";
import { getApiRedisConnection } from "@/shared/infra/queue/redisConnection";
import { ephemeralHash, visitorHash } from "../domain/visitorIdentity";
import { trafficRateLimitMax } from "../trafficConfig";
import type { ITrafficCounter, RecordVisitInput } from "../application/ports/ITrafficCounter";
import * as keys from "./trafficKeys";

function assertNoPipelineError(results: [Error | null, unknown][] | null): void {
  if (!results) return;
  const failed = results.find(([error]) => error !== null);
  if (failed) throw failed[0];
}

/**
 * Redis-backed anonymous counters (request path).
 *
 * Uses the fail-fast `api` connection: when Redis is unreachable the call
 * rejects and the use case records the accepted loss metric — no queueing,
 * no retry storm from page-view traffic.
 */
@injectable()
export class RedisTrafficCounter implements ITrafficCounter {
  /** Process-local salt so raw IPs never reach Redis for rate limiting. */
  private readonly bootSalt = randomBytes(32).toString("hex");

  async consumeRateLimit(ip: string): Promise<boolean> {
    try {
      const client = getApiRedisConnection();
      const epochMinute = Math.floor(Date.now() / 60_000);
      const key = keys.rateLimitKey(epochMinute, ephemeralHash(this.bootSalt, ip));
      // SET NX creates the bucket with a fixed TTL (never refreshed → the
      // window cannot slide); INCR counts this minute's requests.
      const pipeline = client.pipeline();
      pipeline.set(key, "0", "EX", keys.RATE_BUCKET_TTL_SECONDS, "NX");
      pipeline.incr(key);
      const results = await pipeline.exec();
      assertNoPipelineError(results);
      const count = Number(results?.[1]?.[1] ?? 1);
      return count <= trafficRateLimitMax();
    } catch {
      // Limiter unavailable → fail open; the counter below decides the outcome.
      return true;
    }
  }

  async recordVisit(input: RecordVisitInput): Promise<void> {
    const client = getApiRedisConnection();
    const salt = await this.resolveDailySalt(client, input.dayKey);
    const identity = visitorHash(salt, input.ip, input.userAgent);

    // Referrer host cap: ignore new hosts once the daily registry is full,
    // but keep counting hosts that were already registered before the cap.
    let recordOrigin = false;
    if (input.originHost) {
      const registryKey = keys.originRegistryKey(input.dayKey);
      const registered = await client.scard(registryKey);
      recordOrigin =
        registered < keys.MAX_ORIGINS_PER_DAY ||
        (await client.sismember(registryKey, input.originHost)) === 1;
    }

    const pipeline = client.pipeline();

    pipeline.incr(keys.visitsKey(input.dayKey, input.area));
    pipeline.expire(keys.visitsKey(input.dayKey, input.area), keys.COUNT_TTL_SECONDS);

    pipeline.incr(keys.hourlyVisitsKey(input.dayKey, input.hour, input.area));
    pipeline.expire(
      keys.hourlyVisitsKey(input.dayKey, input.hour, input.area),
      keys.COUNT_TTL_SECONDS,
    );

    // HyperLogLog: PFADD does not touch the TTL, so EXPIRE runs on every hit
    // (keys must outlive the consolidation window, not the day itself).
    pipeline.pfadd(keys.visitorsKey(input.dayKey, input.area), identity);
    pipeline.expire(keys.visitorsKey(input.dayKey, input.area), keys.COUNT_TTL_SECONDS);

    pipeline.pfadd(keys.hourlyVisitorsKey(input.dayKey, input.hour, input.area), identity);
    pipeline.expire(
      keys.hourlyVisitorsKey(input.dayKey, input.hour, input.area),
      keys.COUNT_TTL_SECONDS,
    );

    // Session: SET NX marks creation (30 min TTL), EXPIRE renews on every hit.
    const markKey = keys.sessionMarkKey(input.dayKey, input.area, identity);
    pipeline.set(markKey, "1", "EX", keys.SESSION_MARK_TTL_SECONDS, "NX");
    pipeline.expire(markKey, keys.SESSION_MARK_TTL_SECONDS);
    const markResultIndex = pipeline.length - 2;

    if (recordOrigin && input.originHost) {
      const registryKey = keys.originRegistryKey(input.dayKey);
      pipeline.sadd(registryKey, input.originHost);
      pipeline.expire(registryKey, keys.COUNT_TTL_SECONDS);
      pipeline.incr(keys.originKey(input.dayKey, input.originHost));
      pipeline.expire(keys.originKey(input.dayKey, input.originHost), keys.COUNT_TTL_SECONDS);
    }

    const results = await pipeline.exec();
    assertNoPipelineError(results);

    // Only the request that created the session marker increments the
    // day-scoped session counter (one session per visitor per 30-minute idle
    // window; the marker expires when the visitor stays inactive).
    const sessionCreated = results?.[markResultIndex]?.[1] === "OK";
    if (sessionCreated) {
      const sessionPipeline = client.pipeline();
      sessionPipeline.incr(keys.sessionCountKey(input.dayKey, input.area));
      sessionPipeline.expire(
        keys.sessionCountKey(input.dayKey, input.area),
        keys.SESSION_COUNT_TTL_SECONDS,
      );
      const sessionResults = await sessionPipeline.exec();
      assertNoPipelineError(sessionResults);
    }
  }

  /**
   * Daily HMAC salt (random per civil day, TTL 48h). The value stays in
   * Redis only — never logged, never written to the database.
   */
  private async resolveDailySalt(client: IORedis, dayKey: string): Promise<string> {
    const key = keys.saltKey(dayKey);
    const existing = await client.get(key);
    if (existing) return existing;

    const generated = randomBytes(32).toString("hex");
    const created = await client.set(key, generated, "EX", keys.SALT_TTL_SECONDS, "NX");
    if (created === "OK") return generated;

    // Lost a race with a concurrent request — reuse the winner's salt.
    const raced = await client.get(key);
    if (!raced) throw new Error("traffic salt unavailable");
    return raced;
  }
}
