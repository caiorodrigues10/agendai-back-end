/**
 * Atribuição de tráfego às páginas públicas de um salão.
 *
 * Contrato: `frontend/docs/TRAFFIC_BEACON_BACKEND_CONTRACT.md`.
 *
 * Este módulo é PURO: só allowlists, validação de formato e a derivação da
 * seção da página pública. Nada de I/O, nada de log, nada de persistência.
 *
 * Privacidade:
 *   - o identificador público (`salon`) já está na URL compartilhada — pode ser
 *     lido, mas nunca é gravado junto de IP/UA;
 *   - o visitante continua anônimo: a identidade é o hash diário calculado no
 *     servidor (`visitorIdentity.ts`), nunca um id enviado pelo cliente.
 */

/** Allowlist de `kind` — evento do ping de salão. */
export const SALON_TRAFFIC_KINDS = ["visit", "tab"] as const;
export type SalonTrafficKind = (typeof SALON_TRAFFIC_KINDS)[number];

/** Allowlist de `salonType` — forma do identificador público. */
export const SALON_TRAFFIC_IDENTIFIER_TYPES = ["id", "slug"] as const;
export type SalonTrafficIdentifierType =
  (typeof SALON_TRAFFIC_IDENTIFIER_TYPES)[number];

/** Allowlist de `tab` — abas da página pública do salão. */
export const SALON_TRAFFIC_TABS = ["queue", "appointments", "profile"] as const;
export type SalonTrafficTab = (typeof SALON_TRAFFIC_TABS)[number];

/**
 * Seções do relatório do dono — chaves fixas (mesma ordem do frontend).
 * `other` cobre qualquer ping de salão fora dos padrões mapeados.
 */
export const SALON_TRAFFIC_SECTIONS = [
  "profile",
  "queue",
  "appointments",
  "products",
  "other",
] as const;
export type SalonTrafficSection = (typeof SALON_TRAFFIC_SECTIONS)[number];

/** Padrões de rota das páginas públicas de salão monitoradas. */
export const SALON_TRAFFIC_ROUTES = [
  "/queue/:id",
  "/queue/:id/produtos/:productId",
  "/s/:slug",
] as const;
export type SalonTrafficRoute = (typeof SALON_TRAFFIC_ROUTES)[number];

/** Tamanho máximo do identificador público (contrato). */
export const SALON_IDENTIFIER_MAX_LENGTH = 100;

/** Charset do identificador público: `A-Za-z0-9` + hífen (contrato). */
const SALON_IDENTIFIER_PATTERN = /^[A-Za-z0-9-]+$/;

/** UUID canônico do barbershop (`prisma @default(uuid())`). */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Formato do identificador público (antes de qualquer consulta). */
export function isValidSalonIdentifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= SALON_IDENTIFIER_MAX_LENGTH &&
    SALON_IDENTIFIER_PATTERN.test(value)
  );
}

/** true quando o identificador tem a forma de UUID (`salonType:"id"`). */
export function isUuidSalonIdentifier(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/**
 * `salonType` precisa bater com a FORMA do valor — um `id` que não é UUID
 * (ou um `slug` que é UUID) é sinal de payload inconsistente e é descartado
 * pelo schema, nunca "adivinhado" pelo backend.
 */
export function matchesSalonIdentifierType(
  value: string,
  salonType: SalonTrafficIdentifierType,
): boolean {
  const isUuid = isUuidSalonIdentifier(value);
  return salonType === "id" ? isUuid : !isUuid;
}

/** Valor de `tab` fora da allowlist vira ausente (nunca descarta o ping). */
export function sanitizeSalonTrafficTab(value: unknown): SalonTrafficTab | undefined {
  if (typeof value !== "string") return undefined;
  return (SALON_TRAFFIC_TABS as readonly string[]).includes(value)
    ? (value as SalonTrafficTab)
    : undefined;
}

/** true quando o valor de `tab` está na allowlist. */
export function isSalonTrafficTab(value: unknown): value is SalonTrafficTab {
  return sanitizeSalonTrafficTab(value) !== undefined;
}

/**
 * Seção da página pública a partir da rota + aba.
 *
 * Contrato:
 *   - `profile`     → `/s/:slug` e `/queue/:id` com `tab=profile`;
 *   - `queue`       → `/queue/:id` com `tab=queue` (ou sem `tab`);
 *   - `appointments`→ `/queue/:id` com `tab=appointments`;
 *   - `products`    → `/queue/:id/produtos/:productId`;
 *   - `other`       → qualquer outro ping de salão.
 */
export function deriveSalonSection(
  route: SalonTrafficRoute,
  tab?: SalonTrafficTab,
): SalonTrafficSection {
  if (route === "/queue/:id/produtos/:productId") return "products";
  if (route === "/s/:slug") return "profile";
  if (tab === "profile") return "profile";
  if (tab === "appointments") return "appointments";
  return "queue";
}

/**
 * Alvo de atribuição do contador: salão (`b:<uuid>`) ou organização
 * (`o:<uuid>`). O prefixo evita colisão entre os dois escopos e permite
 * agregar as duas chaves na leitura (decisão pendente — ver
 * `PrismaSalonAttributionResolver`).
 */
export type SalonTrafficTargetKind = "barbershop" | "organization";

export function salonTargetKey(
  kind: SalonTrafficTargetKind,
  id: string,
): string {
  return `${kind === "barbershop" ? "b" : "o"}:${id}`;
}

/** true quando a chave de alvo é de um salão (não de uma organização). */
export function isBarbershopTarget(target: string): boolean {
  return target.startsWith("b:");
}
