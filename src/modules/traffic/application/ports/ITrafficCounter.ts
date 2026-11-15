import type { TrafficArea } from "../../domain/trafficAreas";

/**
 * Application port for the anonymous traffic counters (Redis-backed).
 * The application layer never imports ioredis — only this contract.
 */
export interface RecordVisitInput {
  area: TrafficArea;
  /** Client IP already resolved by Fastify `trustProxy` (never the raw XFF). */
  ip: string;
  userAgent: string;
  /** Civil day (YYYY-MM-DD) in America/Sao_Paulo. */
  dayKey: string;
  /** Hour bucket 0–23 in America/Sao_Paulo. */
  hour: number;
  /** Normalized referrer host (path/query already dropped) or null. */
  originHost: string | null;
}

export interface ITrafficCounter {
  /**
   * Consume one unit of the per-IP rate-limit budget.
   * Returns false when the budget is exhausted (silent discard) or when the
   * limiter is unavailable (fail-open — the visit itself is counted next).
   */
  consumeRateLimit(ip: string): Promise<boolean>;
  /** Record one visit (visits + visitors + session + origin). */
  recordVisit(input: RecordVisitInput): Promise<void>;
}
