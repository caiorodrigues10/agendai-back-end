/**
 * Environment flags for the site-traffic feature.
 *
 * TRAFFIC_BEACON_ENABLED defaults to OFF everywhere: with the flag off the
 * ingest route answers 204 and records nothing (rollout control — production
 * enables it only after the privacy review in Fase 3).
 */

function isEnabled(raw: string | undefined): boolean {
  return raw?.trim().toLowerCase() === "true";
}

/** Master switch for the anonymous beacon (`POST /api/ping`). Default: false. */
export function trafficBeaconEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return isEnabled(env.TRAFFIC_BEACON_ENABLED);
}

/** Extra hosts never counted (demo/staging), appended to the built-in list. */
export function trafficExtraIgnoreHosts(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.TRAFFIC_IGNORE_HOSTS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

const DEFAULT_RATE_LIMIT_MAX = 120;

/**
 * Generous per-IP rate limit for the beacon (requests/minute). Excess is
 * discarded silently — the response is still 204 and nothing is recorded.
 */
export function trafficRateLimitMax(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env.TRAFFIC_RATE_LIMIT_MAX);
  if (!Number.isInteger(raw) || raw < 1) return DEFAULT_RATE_LIMIT_MAX;
  return Math.min(raw, 10_000);
}
