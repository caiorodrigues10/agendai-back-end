/**
 * Traffic areas — pure classification of a page path into one of the three
 * platform areas (or null when the request must not be counted at all).
 *
 * Privacy contract: this module only ever *reads* the path to classify it.
 * The path (including any `?token=` query string or route id) is never
 * returned, stored or logged — only the area enum leaves this function.
 */

export const TRAFFIC_AREAS = ["public_site", "salon_public", "logged_area"] as const;

export type TrafficArea = (typeof TRAFFIC_AREAS)[number];

/** pt-BR labels for the master-admin report (single catalog for screens). */
export const TRAFFIC_AREA_LABELS: Record<TrafficArea, string> = {
  public_site: "Site público/landing",
  salon_public: "Páginas públicas de salão",
  logged_area: "Área logada",
};

/** Paths prefixed by any of these belong to the master panel — never counted. */
const EXCLUDED_PREFIXES = ["/master"];

/** Logged-in application areas (front routes `/app/*` and the client portal). */
const LOGGED_PREFIXES = ["/app", "/minha-conta"];

/**
 * Public salon pages: share links (`/s/*`), public queue/shop pages,
 * token-driven pages (invite, contract, review, NPS) and showcase posts.
 */
const SALON_PUBLIC_PREFIXES = [
  "/s/",
  "/queue/",
  "/saloes/",
  "/nps/",
  "/convite/",
  "/assinar/",
  "/avaliar",
  "/agendamento/gerenciar",
];

function matchesPrefix(path: string, prefix: string): boolean {
  if (prefix.endsWith("/")) return path.startsWith(prefix);
  return path === prefix || path.startsWith(`${prefix}/`);
}

/**
 * Classify a front route path. Returns `null` for traffic that must be
 * discarded (master panel), otherwise the area the visit belongs to.
 * Unknown paths default to `public_site`: every logged route in the SPA lives
 * under `/app` or `/minha-conta`, which are matched explicitly above.
 */
export function classifyTrafficArea(rawPath: string): TrafficArea | null {
  const path = normalizeTrafficPath(rawPath);

  for (const prefix of EXCLUDED_PREFIXES) {
    if (matchesPrefix(path, prefix)) return null;
  }
  for (const prefix of LOGGED_PREFIXES) {
    if (matchesPrefix(path, prefix)) return "logged_area";
  }
  for (const prefix of SALON_PUBLIC_PREFIXES) {
    if (matchesPrefix(path, prefix)) return "salon_public";
  }
  return "public_site";
}

/**
 * Strip query string/fragment and force a leading slash. The sanitized value
 * is used for classification only and must never be persisted.
 */
export function normalizeTrafficPath(rawPath: string): string {
  const withoutQuery = rawPath.split(/[?#]/)[0] ?? "";
  const trimmed = withoutQuery.trim();
  if (trimmed === "") return "/";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}
