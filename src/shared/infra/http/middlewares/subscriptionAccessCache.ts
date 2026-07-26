/**
 * Cache in-memory do checkSubscription — módulo isolado para
 * permitir invalidação no webhook sem dependência circular.
 */
const subscriptionCache = new Map<
  string,
  { allowed: boolean; expiresAt: number }
>();

export const SUBSCRIPTION_CACHE_TTL_MS = 60_000;

export function getCachedAccess(barbershopId: string): boolean | null {
  const entry = subscriptionCache.get(barbershopId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    subscriptionCache.delete(barbershopId);
    return null;
  }
  return entry.allowed;
}

export function setCachedAccess(barbershopId: string, allowed: boolean): void {
  subscriptionCache.set(barbershopId, {
    allowed,
    expiresAt: Date.now() + SUBSCRIPTION_CACHE_TTL_MS,
  });
}

/** Invalida cache após pagamento/webhook — evita 402 falso por até 60s. */
export function invalidateSubscriptionCache(barbershopId: string): void {
  subscriptionCache.delete(barbershopId);
}
