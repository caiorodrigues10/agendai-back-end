/**
 * Avaliação das condições de requisição do beacon (antes de qualquer escrita).
 *
 * Regras compartilhadas pelo beacon global (marketing) e pelo beacon de salão:
 * feature flag, opt-out (DNT/GPC), prefetch, bots, área da rota, origem
 * permitida e hosts ignorados. Tudo aqui é puro: nenhuma escrita, nenhum log
 * com conteúdo de requisição.
 */

import {
  classifyTrafficArea,
  type TrafficArea,
} from "./trafficAreas";
import {
  hostFromUrl,
  isBotUserAgent,
  isIgnoredHost,
  isOriginAllowed,
  isPrefetch,
  isPrivacyOptOut,
  normalizeOriginHost,
  referrerHostFromValue,
} from "./trafficExclusions";

/** Metadados da requisição usados pelas regras de exclusão. */
export interface BeaconRequestMetadata {
  /** Raw front route path (query string allowed — never persisted). */
  path: string;
  /** Referrer hostname (or legacy absolute URL) sent by the browser. */
  referrer: string | undefined;
  /** IP já resolvido pelo Fastify conforme `TRUST_PROXY`. */
  ip: string;
  userAgent: string | undefined;
  headers: Record<string, unknown>;
  /** HTTP `Origin` of the page firing the beacon. */
  origin: string | undefined;
  /** ALLOWED_ORIGINS — a mesma lista que backs CORS. */
  allowedOrigins: readonly string[];
  /** Built-in + TRAFFIC_IGNORE_HOSTS list. */
  ignoreHosts: readonly string[];
  /** TRAFFIC_BEACON_ENABLED (read by the presentation layer). */
  enabled: boolean;
}

export type BeaconRequestDecision =
  | { accepted: true; area: TrafficArea; originHost: string | null }
  | { accepted: false; reason: "disabled" | "excluded" };

/**
 * Decide se a requisição pode ser contada e qual área ela pertence.
 *
 * A ordem é intencional: as exclusões baratas (opt-out, prefetch, bot) rodam
 * antes de qualquer cálculo de identidade, e a área é resolvida antes do
 * referrer para que o painel master nunca seja classificado.
 */
export function evaluateBeaconRequest(
  request: BeaconRequestMetadata,
): BeaconRequestDecision {
  if (!request.enabled) return { accepted: false, reason: "disabled" };

  // Privacy opt-outs and prefetch are answered before anything else.
  if (isPrivacyOptOut(request.headers)) return { accepted: false, reason: "excluded" };
  if (isPrefetch(request.headers)) return { accepted: false, reason: "excluded" };
  if (isBotUserAgent(request.userAgent)) return { accepted: false, reason: "excluded" };

  // The master panel is never counted (its traffic would pollute metrics).
  const area = classifyTrafficArea(request.path);
  if (area === null) return { accepted: false, reason: "excluded" };

  // Browsers always send Origin on POST; missing/foreign origin = discard.
  if (!isOriginAllowed(request.origin, request.allowedOrigins)) {
    return { accepted: false, reason: "excluded" };
  }

  // Referrer host (path/query dropped by construction) — never local/test.
  const referrerHost = normalizeOriginHost(referrerHostFromValue(request.referrer));
  const requestHost = hostFromUrl(request.origin);
  if (
    isIgnoredHost(referrerHost, request.ignoreHosts) ||
    isIgnoredHost(requestHost, request.ignoreHosts)
  ) {
    return { accepted: false, reason: "excluded" };
  }

  // Same-site navigation: recorded as "(interno)" instead of the site host.
  const originHost =
    referrerHost && requestHost && referrerHost === requestHost ? "(interno)" : referrerHost;

  return { accepted: true, area, originHost };
}
