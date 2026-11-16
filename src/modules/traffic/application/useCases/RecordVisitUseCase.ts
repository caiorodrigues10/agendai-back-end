import { inject, injectable } from "tsyringe";
import { classifyTrafficArea, type TrafficArea } from "../../domain/trafficAreas";
import {
  hostFromUrl,
  isBotUserAgent,
  isIgnoredHost,
  isOriginAllowed,
  isPrefetch,
  isPrivacyOptOut,
  normalizeOriginHost,
  referrerHostFromValue,
} from "../../domain/trafficExclusions";
import { spDayKey, spHour } from "../../domain/periodWindows";
import { incrementRedisUnavailableDrop } from "../../lossCounters";
import type { ITrafficCounter } from "../ports/ITrafficCounter";

export const TRAFFIC_COUNTER = "TrafficCounter";

/** Everything the controller extracts from the incoming beacon request. */
export interface RecordVisitRequest {
  /** Raw front route path (query string allowed — never persisted). */
  path: string;
  /** Referrer hostname (or legacy absolute URL) sent by the browser. */
  referrer: string | undefined;
  ip: string;
  userAgent: string | undefined;
  headers: Record<string, unknown>;
  /** HTTP `Origin` of the page firing the beacon. */
  origin: string | undefined;
  /** ALLOWED_ORIGINS — the same list that backs CORS. */
  allowedOrigins: readonly string[];
  /** Built-in + TRAFFIC_IGNORE_HOSTS list. */
  ignoreHosts: readonly string[];
  /** TRAFFIC_BEACON_ENABLED (read by the presentation layer). */
  enabled: boolean;
}

export type RecordVisitResult =
  | { counted: true; area: TrafficArea }
  | { counted: false; reason: "disabled" | "excluded" | "rate_limited" | "counter_error" };

/**
 * Ingest one anonymous page-view beacon.
 *
 * Order matters: cheap request-level exclusions run before any Redis work,
 * so bots/opt-outs/master-panel traffic never even hashes an identity. Every
 * failure mode resolves to `{ counted: false }` — the HTTP answer is always
 * 204 and no request data is ever logged.
 */
@injectable()
export class RecordVisitUseCase {
  constructor(@inject(TRAFFIC_COUNTER) private readonly counter: ITrafficCounter) {}

  async execute(request: RecordVisitRequest, now: Date = new Date()): Promise<RecordVisitResult> {
    if (!request.enabled) return { counted: false, reason: "disabled" };

    // Privacy opt-outs and prefetch are answered before anything else.
    if (isPrivacyOptOut(request.headers)) return { counted: false, reason: "excluded" };
    if (isPrefetch(request.headers)) return { counted: false, reason: "excluded" };
    if (isBotUserAgent(request.userAgent)) return { counted: false, reason: "excluded" };

    // The master panel is never counted (its traffic would pollute metrics).
    const area = classifyTrafficArea(request.path);
    if (area === null) return { counted: false, reason: "excluded" };

    // Browsers always send Origin on POST; missing/foreign origin = discard.
    if (!isOriginAllowed(request.origin, request.allowedOrigins)) {
      return { counted: false, reason: "excluded" };
    }

    // Referrer host (path/query dropped by construction) — never local/test.
    const referrerHost = normalizeOriginHost(referrerHostFromValue(request.referrer));
    const requestHost = hostFromUrl(request.origin);
    if (isIgnoredHost(referrerHost, request.ignoreHosts) || isIgnoredHost(requestHost, request.ignoreHosts)) {
      return { counted: false, reason: "excluded" };
    }

    // Same-site navigation: recorded as "(interno)" instead of the site host.
    const originHost =
      referrerHost && requestHost && referrerHost === requestHost ? "(interno)" : referrerHost;

    try {
      const allowed = await this.counter.consumeRateLimit(request.ip);
      if (!allowed) return { counted: false, reason: "rate_limited" };

      await this.counter.recordVisit({
        area,
        ip: request.ip,
        userAgent: request.userAgent ?? "",
        dayKey: spDayKey(now),
        hour: spHour(now),
        originHost,
      });
      return { counted: true, area };
    } catch {
      // Redis unavailable (or any counter failure): accepted loss + metric.
      incrementRedisUnavailableDrop();
      return { counted: false, reason: "counter_error" };
    }
  }
}
