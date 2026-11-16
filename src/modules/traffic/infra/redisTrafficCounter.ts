import { randomBytes } from "node:crypto";
import { injectable } from "tsyringe";
import type IORedis from "ioredis";
import { getApiRedisConnection } from "@/shared/infra/queue/redisConnection";
import { rateLimitHash, visitorHash } from "../domain/visitorIdentity";
import { spDayKey } from "../domain/periodWindows";
import { TRAFFIC_TOTAL_AREA } from "../domain/trafficAreas";
import { trafficRateLimitMax } from "../trafficConfig";
import type { ITrafficCounter, RecordVisitInput } from "../application/ports/ITrafficCounter";
import * as keys from "./trafficKeys";

function assertNoPipelineError(results: [Error | null, unknown][] | null): void {
  if (!results) return;
  const failed = results.find(([error]) => error !== null);
  if (failed) throw failed[0];
}

/**
 * Registers a referrer host and increments its counter atomically.
 *
 * The cardinality check, membership check and insertion must run in one Redis
 * script: separate SCARD/SISMEMBER/SADD commands allow concurrent requests to
 * exceed the daily host cap.
 */
const REGISTER_ORIGIN_SCRIPT = `
local registered = redis.call("SCARD", KEYS[1])
local known = redis.call("SISMEMBER", KEYS[1], ARGV[1])
local maximum = tonumber(ARGV[2])
if registered >= maximum and known == 0 then
  return 0
end
redis.call("SADD", KEYS[1], ARGV[1])
redis.call("EXPIRE", KEYS[1], tonumber(ARGV[3]))
redis.call("INCR", KEYS[2])
redis.call("EXPIRE", KEYS[2], tonumber(ARGV[3]))
return 1
`;

/**
 * Redis-backed anonymous counters (request path).
 *
 * Uses the fail-fast `api` connection: when Redis is unreachable the call
 * rejects and the use case records the accepted loss metric — no queueing,
 * no retry storm from page-view traffic.
 */
@injectable()
export class RedisTrafficCounter implements ITrafficCounter {
  async consumeRateLimit(ip: string): Promise<boolean> {
    try {
      const client = getApiRedisConnection();
      const dayKey = spDayKey(new Date());
      const salt = await this.resolveDailySalt(
        client,
        keys.rateLimitSaltKey(dayKey),
        keys.RATE_LIMIT_SALT_TTL_SECONDS,
      );
      const epochMinute = Math.floor(Date.now() / 60_000);
      const key = keys.rateLimitKey(epochMinute, rateLimitHash(salt, ip));
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
    const salt = await this.resolveDailySalt(
      client,
      keys.saltKey(input.dayKey),
      keys.SALT_TTL_SECONDS,
    );
    const identity = visitorHash(salt, input.ip, input.userAgent);

    // Keep both the area-local row and a site-wide aggregate. The aggregate
    // HLL/session marker prevents one visitor crossing areas from being
    // counted twice when the report uses area=all.
    const aggregateAreas = [input.area, TRAFFIC_TOTAL_AREA] as const;
    const pipeline = client.pipeline();
    const sessionMarkerIndexes = new Map<string, number>();

    for (const area of aggregateAreas) {
      pipeline.incr(keys.visitsKey(input.dayKey, area));
      pipeline.expire(keys.visitsKey(input.dayKey, area), keys.COUNT_TTL_SECONDS);

      pipeline.incr(keys.hourlyVisitsKey(input.dayKey, input.hour, area));
      pipeline.expire(
        keys.hourlyVisitsKey(input.dayKey, input.hour, area),
        keys.COUNT_TTL_SECONDS,
      );

      // HyperLogLog: PFADD does not touch the TTL, so EXPIRE runs on every hit
      // (keys must outlive the consolidation window, not the day itself).
      pipeline.pfadd(keys.visitorsKey(input.dayKey, area), identity);
      pipeline.expire(keys.visitorsKey(input.dayKey, area), keys.COUNT_TTL_SECONDS);

      pipeline.pfadd(keys.hourlyVisitorsKey(input.dayKey, input.hour, area), identity);
      pipeline.expire(
        keys.hourlyVisitorsKey(input.dayKey, input.hour, area),
        keys.COUNT_TTL_SECONDS,
      );

      // Session: SET NX marks creation (30 min TTL), EXPIRE renews on every hit.
      const markKey = keys.sessionMarkKey(input.dayKey, area, identity);
      const markerIndex = pipeline.length;
      pipeline.set(markKey, "1", "EX", keys.SESSION_MARK_TTL_SECONDS, "NX");
      pipeline.expire(markKey, keys.SESSION_MARK_TTL_SECONDS);
      sessionMarkerIndexes.set(area, markerIndex);
    }

    const results = await pipeline.exec();
    assertNoPipelineError(results);

    const createdAreas = aggregateAreas.filter(
      (area) => results?.[sessionMarkerIndexes.get(area)!]?.[1] === "OK",
    );
    if (createdAreas.length > 0) {
      const sessionPipeline = client.pipeline();
      for (const area of createdAreas) {
        sessionPipeline.incr(keys.sessionCountKey(input.dayKey, area));
        sessionPipeline.expire(
          keys.sessionCountKey(input.dayKey, area),
          keys.SESSION_COUNT_TTL_SECONDS,
        );
      }
      const sessionResults = await sessionPipeline.exec();
      assertNoPipelineError(sessionResults);
    }

    if (input.originHost) {
      // Atomic cap + membership + increment. Existing hosts keep counting;
      // only new hosts are ignored after the registry reaches the cap.
      await client.eval(
        REGISTER_ORIGIN_SCRIPT,
        2,
        keys.originRegistryKey(input.dayKey),
        keys.originKey(input.dayKey, input.originHost),
        input.originHost,
        String(keys.MAX_ORIGINS_PER_DAY),
        String(keys.COUNT_TTL_SECONDS),
      );
    }
  }

  /**
   * Daily HMAC salt (random per civil day, TTL 48h). The value stays in
   * Redis only — never logged, never written to the database.
   */
  private async resolveDailySalt(
    client: IORedis,
    key: string,
    ttlSeconds: number,
  ): Promise<string> {
    const existing = await client.get(key);
    if (existing) return existing;

    const generated = randomBytes(32).toString("hex");
    const created = await client.set(key, generated, "EX", ttlSeconds, "NX");
    if (created === "OK") return generated;

    // Lost a race with a concurrent request — reuse the winner's salt.
    const raced = await client.get(key);
    if (!raced) throw new Error("traffic salt unavailable");
    return raced;
  }
}
