import type { BusinessSegment } from "@prisma/client";
import { SEGMENT_CONFIGS } from "./index";

/**
 * Restrição de publicidade por segmento.
 *
 * Alguns segmentos (advocacia, por exemplo) não devem fazer divulgação
 * comercial. A regra vive na config do segmento (`advertisingRestricted`) e é
 * aplicada em todo o produto por este módulo — nunca por `if (segment === ...)`
 * espalhado em componentes.
 *
 * O que desliga quando o segmento é restrito:
 * - campanhas e mensagens em massa do assistente;
 * - pedido de avaliação e nota/reputação públicas;
 * - pesquisa NPS;
 * - indicações (referrals) e fidelidade (loyalty);
 * - preços públicos no perfil/agenda pública.
 *
 * O que continua existindo: a consulta interna do dono ("quem não vem há X
 * dias") — é lista para o dono, não disparo ao cliente.
 */

/** O segmento tem restrição de publicidade? */
export function isAdvertisingRestricted(
  segment: BusinessSegment | null | undefined
): boolean {
  if (!segment) return false;
  return SEGMENT_CONFIGS[segment]?.advertisingRestricted === true;
}

/**
 * Tipos de notificação considered promocionais (divulgação comercial).
 * Bloqueados em segmentos com restrição de publicidade.
 */
export const ADVERTISING_RESTRICTED_NOTIFICATION_TYPES = [
  "CRM_CAMPAIGN",
  "REVIEW_REQUESTED",
  "NPS_SURVEY",
  "REFERRAL_APPLIED",
  "REFERRAL_CONVERTED",
  "REFERRAL_REVOKED",
] as const;

export type AdvertisingRestrictedNotificationType =
  (typeof ADVERTISING_RESTRICTED_NOTIFICATION_TYPES)[number];

/** A notificação é promocional? (independe do segmento) */
export function isPromotionalNotificationType(type: string): boolean {
  return (ADVERTISING_RESTRICTED_NOTIFICATION_TYPES as readonly string[]).includes(type);
}

/** A notificação pode ser enviada no segmento? */
export function isNotificationAllowedForSegment(
  type: string,
  segment: BusinessSegment | null | undefined
): boolean {
  if (!isAdvertisingRestricted(segment)) return true;
  return !isPromotionalNotificationType(type);
}
