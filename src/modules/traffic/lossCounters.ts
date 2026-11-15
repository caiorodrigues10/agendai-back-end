/**
 * In-memory loss counters for the traffic feature (instance-local).
 *
 * `redisUnavailableDrops` counts beacon hits discarded because Redis was
 * unreachable — accepted loss (decision: Redis outage = drop + metric). The
 * counter lives in this process only: with multiple API instances the report
 * shows the value of the instance that served the request (documented in
 * docs/RUNBOOK_MIGRATIONS.md). Counter regressions after a Redis restart are
 * persisted instead (site_traffic_daily.lostUpdates).
 */
let redisUnavailableDrops = 0;

export function incrementRedisUnavailableDrop(): void {
  redisUnavailableDrops += 1;
}

export function getRedisUnavailableDrops(): number {
  return redisUnavailableDrops;
}

/** Test helper — resets the instance-local counter. */
export function resetRedisUnavailableDrops(): void {
  redisUnavailableDrops = 0;
}
