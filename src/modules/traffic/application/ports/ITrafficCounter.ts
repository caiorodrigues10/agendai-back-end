import type { TrafficArea } from "../../domain/trafficAreas";
import type { SalonTrafficKind, SalonTrafficSection } from "../../domain/salonTraffic";

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

/** Ping de página pública de salão (atribuído a um salão ou organização). */
export interface RecordSalonVisitInput {
  /** Chave de atribuição (`b:<uuid>` salão / `o:<uuid>` organização). */
  target: string;
  /** Seção da página pública (única métrica alimentada por pings `tab`). */
  section: SalonTrafficSection;
  /** `visit` soma visita/visitante; `tab` soma só a seção. */
  kind: SalonTrafficKind;
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
  /**
   * Record one ping of a public salon page.
   *
   * `kind:"visit"` increments visits/visitors (per day and per hour) and the
   * referrer origin; `kind:"tab"` only increments the section counters. Both
   * kinds feed the section breakdown.
   */
  recordSalonVisit(input: RecordSalonVisitInput): Promise<void>;
}
