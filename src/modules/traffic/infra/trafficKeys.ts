/**
 * Redis key builders and TTLs for the site-traffic feature.
 *
 * Single source of truth shared by the request-path counter, the
 * consolidation cron and the user-activity dedupe. Key shapes are part of
 * the operational contract — see docs/RUNBOOK_MIGRATIONS.md.
 *
 * Nothing personal is ever written under these keys: visitor identity is a
 * daily HMAC (salt rotates per civil day, TTL 48h) and the salt itself is
 * never logged or persisted outside Redis.
 */

/** Visits/visitors/origins live a few days after their civil day. */
export const COUNT_TTL_SECONDS = 4 * 24 * 60 * 60;
/** Session counters are day-scoped and kept for a week. */
export const SESSION_COUNT_TTL_SECONDS = 7 * 24 * 60 * 60;
/** Session marker: 30 minutes of inactivity ends a session. */
export const SESSION_MARK_TTL_SECONDS = 30 * 60;
/** Daily HMAC salt — rotated per civil day, kept 48h (LGPD ceiling). */
export const SALT_TTL_SECONDS = 48 * 60 * 60;
/** Shared daily salt for the per-IP bucket (one quota across API replicas). */
export const RATE_LIMIT_SALT_TTL_SECONDS = 48 * 60 * 60;
/** Rate-limit bucket: one per minute, kept 2 minutes for cleanup. */
export const RATE_BUCKET_TTL_SECONDS = 120;
/** User-activity dedupe marker: one per user per civil day. */
export const USER_ACTIVITY_TTL_SECONDS = 24 * 60 * 60;
/** Maximum distinct referrer hosts recorded per civil day (spam guard). */
export const MAX_ORIGINS_PER_DAY = 200;

export function saltKey(dayKey: string): string {
  return `traffic:salt:${dayKey}`;
}

export function rateLimitSaltKey(dayKey: string): string {
  return `traffic:rl-salt:${dayKey}`;
}

export function visitsKey(dayKey: string, area: string): string {
  return `traffic:v:${dayKey}:${area}`;
}

export function visitorsKey(dayKey: string, area: string): string {
  return `traffic:h:${dayKey}:${area}`;
}

export function hourlyVisitsKey(dayKey: string, hour: number, area: string): string {
  return `traffic:vh:${dayKey}:${padHour(hour)}:${area}`;
}

export function hourlyVisitorsKey(dayKey: string, hour: number, area: string): string {
  return `traffic:hh:${dayKey}:${padHour(hour)}:${area}`;
}

export function sessionCountKey(dayKey: string, area: string): string {
  return `traffic:sc:${dayKey}:${area}`;
}

export function sessionMarkKey(dayKey: string, area: string, visitorHash: string): string {
  return `traffic:sm:${dayKey}:${area}:${visitorHash}`;
}

export function originRegistryKey(dayKey: string): string {
  return `traffic:or:${dayKey}`;
}

export function originKey(dayKey: string, host: string): string {
  return `traffic:o:${dayKey}:${host}`;
}

export function rateLimitKey(epochMinute: number, hashedIp: string): string {
  return `traffic:rl:${epochMinute}:${hashedIp}`;
}

export function userActivityDedupeKey(dayKey: string, userId: string): string {
  return `traffic:ua:${dayKey}:${userId}`;
}

function padHour(hour: number): string {
  return String(hour).padStart(2, "0");
}
