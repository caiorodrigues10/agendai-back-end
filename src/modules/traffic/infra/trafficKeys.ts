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
/**
 * Hashes de visitante do salão: teto de 24h (teto de privacidade do contrato).
 * O EXPIRE é renovado a cada ping, mas o hash nunca sobrevive a 24h sem
 * nenhum novo evento — e a consolidação (horária) sempre roda antes disso.
 */
export const SALON_HASH_TTL_SECONDS = 24 * 60 * 60;
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

/**
 * Alvos (salões/organizações) com ping no dia — a consolidação usa este
 * registro para enumerar o que precisa ser lido do Redis.
 */
export function salonRegistryKey(dayKey: string): string {
  return `traffic:s:reg:${dayKey}`;
}

/** Visitas do dia por alvo de atribuição (`b:<uuid>` / `o:<uuid>`). */
export function salonVisitsKey(dayKey: string, target: string): string {
  return `traffic:s:v:${dayKey}:${target}`;
}

/** Visitantes distintos do dia por alvo (HLL de hash diário). */
export function salonVisitorsKey(dayKey: string, target: string): string {
  return `traffic:s:h:${dayKey}:${target}`;
}

/** Visitas por hora do dia (série `period=day`). */
export function salonHourlyVisitsKey(
  dayKey: string,
  hour: number,
  target: string,
): string {
  return `traffic:s:vh:${dayKey}:${padHour(hour)}:${target}`;
}

/** Visitantes por hora do dia (HLL de hash diário). */
export function salonHourlyVisitorsKey(
  dayKey: string,
  hour: number,
  target: string,
): string {
  return `traffic:s:hh:${dayKey}:${padHour(hour)}:${target}`;
}

/** Visitas por seção da página pública (visits + abas). */
export function salonSectionVisitsKey(
  dayKey: string,
  target: string,
  section: string,
): string {
  return `traffic:s:sv:${dayKey}:${target}:${section}`;
}

/** Visitantes distintos por seção (HLL de hash diário). */
export function salonSectionVisitorsKey(
  dayKey: string,
  target: string,
  section: string,
): string {
  return `traffic:s:sh:${dayKey}:${target}:${section}`;
}

/** Registro de hosts de origem por alvo (teto diário). */
export function salonOriginRegistryKey(dayKey: string, target: string): string {
  return `traffic:s:or:${dayKey}:${target}`;
}

/** Contador de visitas por host de origem e alvo. */
export function salonOriginKey(
  dayKey: string,
  target: string,
  host: string,
): string {
  return `traffic:s:o:${dayKey}:${target}:${host}`;
}

export function userActivityDedupeKey(dayKey: string, userId: string): string {
  return `traffic:ua:${dayKey}:${userId}`;
}

function padHour(hour: number): string {
  return String(hour).padStart(2, "0");
}
