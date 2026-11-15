/**
 * Beacon exclusion rules — pure predicates over request metadata.
 *
 * Everything here is decided BEFORE any Redis/database write: excluded
 * requests are answered with the same 204 as everyone else and leave no
 * trace (no counter, no hash, no log line with request data).
 */

/**
 * Known bot/crawler/headless user agents. Matched case-insensitively against
 * the full UA string. An empty UA is treated as a bot (browsers always send
 * one, even reduced).
 */
const BOT_UA_PATTERNS: RegExp[] = [
  /bot\b/,
  /crawler/,
  /spider/,
  /slurp/,
  /headless/,
  /phantomjs/,
  /lightning/,
  /\bwget\b/,
  /\bcurl\b/,
  /python-(requests|httpx|aiohttp)/,
  /java\//,
  /go-http-client/,
  /okhttp\//,
  /apache-httpclient/,
  /monitoring/,
  /uptime/,
  /lighthouse/,
  /pagespeed/,
  /chrome-lighthouse/,
  /pingdom/,
  /uptimerobot/,
  /facebookexternalhit/,
  /twitterbot/,
  /slackbot/,
  /discordbot/,
  /telegrambot/,
  /embedly/,
  /pinterest/,
  /redditbot/,
  /applebot/,
  /semrushbot/,
  /ahrefsbot/,
  /mj12bot/,
  /dotbot/,
  /bytespider/,
  /yandex(bot|images|mobilebot)/,
  /baiduspider/,
  /duckduckbot/,
  /bingbot/,
  /adsbot/,
  /mediapartners/,
  /netcraft/,
  /scrapy/,
  /coccoc/,
  /ia_archiver/,
];

/** True when the user agent looks like a crawler, bot or headless client. */
export function isBotUserAgent(userAgent: string | undefined | null): boolean {
  if (!userAgent || userAgent.trim() === "") return true;
  const ua = userAgent.toLowerCase();
  return BOT_UA_PATTERNS.some((pattern) => pattern.test(ua));
}

/**
 * True when the browser signals a prefetch/prerender (Sec-Purpose or the
 * legacy Purpose/X-Purpose headers). Those are not real user navigations.
 * `prerender` is checked independently because some browsers send it without
 * the `prefetch` token.
 */
export function isPrefetch(headers: Record<string, unknown>): boolean {
  const values = [
    headers["sec-purpose"],
    headers["purpose"],
    headers["x-purpose"],
  ];
  return values.some((value) => {
    if (typeof value !== "string") return false;
    const normalized = value.toLowerCase();
    return normalized.includes("prefetch") || normalized.includes("prerender");
  });
}

/**
 * True when the visitor opted out via Do Not Track (`DNT: 1`) or Global
 * Privacy Control (`Sec-GPC: 1`). Opt-out requests are never counted.
 */
export function isPrivacyOptOut(headers: Record<string, unknown>): boolean {
  const dnt = headers["dnt"];
  if (typeof dnt === "string" && dnt.trim() === "1") return true;
  const gpc = headers["sec-gpc"];
  if (typeof gpc === "string" && gpc.trim() === "1") return true;
  return false;
}

/**
 * Origin allow-list check for the beacon. Browsers always send `Origin` on
 * POST, so a missing/`null` origin means a non-browser client (curl, spam)
 * and is discarded. `allowedOrigins` comes from `ALLOWED_ORIGINS` (the same
 * list that backs CORS).
 */
export function isOriginAllowed(
  origin: string | undefined | null,
  allowedOrigins: readonly string[],
): boolean {
  if (!origin || origin === "null") return false;
  if (allowedOrigins.length === 0) return false;
  return allowedOrigins.includes(origin.trim());
}

/**
 * Hosts whose traffic is never counted: built-in local/test hosts plus the
 * `TRAFFIC_IGNORE_HOSTS` extras (demo/staging hosts). Matching is exact or
 * dot-suffix (`*.local` style entries start with a dot).
 */
export function isIgnoredHost(
  host: string | null | undefined,
  ignoreHosts: readonly string[],
): boolean {
  if (!host) return false;
  const normalized = host.trim().toLowerCase();
  if (normalized === "") return false;
  return ignoreHosts.some((entry) => {
    const needle = entry.trim().toLowerCase();
    if (needle === "") return false;
    if (needle.startsWith(".")) return normalized.endsWith(needle);
    return normalized === needle || normalized.endsWith(`.${needle}`);
  });
}

/** Built-in hosts that never count (dev, test, local tooling). */
export const DEFAULT_IGNORED_HOSTS: readonly string[] = [
  "localhost",
  "127.0.0.1",
  "::1",
  ".local",
  ".test",
  ".localhost",
];

/**
 * Extract the hostname from a URL string (document.referrer). Returns null
 * for empty/relative/unparseable values — the path and query are dropped by
 * construction, only the host ever leaves this function.
 */
export function hostFromUrl(rawUrl: string | undefined | null): string | null {
  if (!rawUrl) return null;
  const trimmed = rawUrl.trim();
  if (trimmed === "") return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}

/**
 * Normalize a referrer host for storage: lowercase, trimmed, capped at
 * 255 chars (column width). Returns null when the value is unusable.
 */
export function normalizeOriginHost(host: string | null): string | null {
  if (!host) return null;
  const normalized = host.trim().toLowerCase().slice(0, 255);
  return normalized === "" ? null : normalized;
}
