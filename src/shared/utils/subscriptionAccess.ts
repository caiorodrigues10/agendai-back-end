/**
 * Regras de acesso pós-cadastro:
 * - Sem assinatura: trial de 30 dias liberado automaticamente (ver README).
 * - ACTIVE (ou CANCELED com período pago) → liberado (já pagou).
 * - TRIALING com cartão vaulted Asaas → liberado durante o trial.
 * - TRIALING sem cartão → bloqueado (CARD_REQUIRED).
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
    // Sem nenhuma assinatura ainda: trial de 30 dias liberado
    // automaticamente, sem exigir cartão (ver README "Trial").
    if (now <= trialEnd) return { allowed: true, cardRequired: false };
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
