/**
 * Regras de acesso pós-cadastro:
 * - ACTIVE (ou CANCELED com período pago) → liberado (já pagou).
 * - TRIALING com cartão vaulted Asaas → liberado durante o trial.
 * - Calendário de trial sem cartão → bloqueado (CARD_REQUIRED).
 */

export function hasVaultedCard(sub: {
  asaasCreditCardToken?: string | null;
}): boolean {
  return Boolean(sub.asaasCreditCardToken);
}

export function subscriptionGrantsAccess(
  subscription: {
    status: string;
    endDate?: Date | null;
    asaasCreditCardToken?: string | null;
  } | null | undefined,
  now: Date,
  trialEnd: Date
): { allowed: boolean; cardRequired: boolean } {
  if (!subscription) {
    // Dentro do calendário de trial sem assinatura/cartão → exige setup
    if (now <= trialEnd) return { allowed: false, cardRequired: true };
    return { allowed: false, cardRequired: false };
  }

  const hasPaidPeriodLeft =
    subscription.status === "CANCELED" &&
    subscription.endDate != null &&
    subscription.endDate > now;

  if (subscription.status === "ACTIVE" || hasPaidPeriodLeft) {
    return { allowed: true, cardRequired: false };
  }

  if (
    subscription.status === "TRIALING" &&
    hasVaultedCard(subscription) &&
    now <= trialEnd
  ) {
    return { allowed: true, cardRequired: false };
  }

  // Ainda no calendário de trial mas sem cartão (ou TRIALING órfão)
  if (now <= trialEnd && !hasVaultedCard(subscription)) {
    return { allowed: false, cardRequired: true };
  }

  return { allowed: false, cardRequired: false };
}
