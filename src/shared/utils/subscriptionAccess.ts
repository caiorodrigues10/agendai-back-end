/**
 * Regras de acesso pós-cadastro:
 * - Sem assinatura: trial de 30 dias liberado automaticamente, sem cartão.
 * - TRIALING (com ou sem cartão vaulted) durante o calendário de trial → liberado.
 * - ACTIVE (ou CANCELED com período pago) → liberado.
 * - Depois do trial, sem ACTIVE / período pago → bloqueado nas APIs (402).
 *   Login não usa este bloqueio (emite JWT para o dono poder assinar).
 * - Cartão Asaas vaulted é opcional (antecipar débito pós-trial); não é porta de entrada.
 */

export function hasVaultedCard(sub: {
	asaasCreditCardToken?: string | null
}): boolean {
	return Boolean(sub.asaasCreditCardToken)
}

/** CPF só é bloqueado em inadimplência real, não só porque o trial calendário acabou. */
export function shouldBlockOwnerCpfsOnDeniedAccess(
	status?: string | null,
): boolean {
	return status === 'PAST_DUE' || status === 'UNPAID'
}

export function subscriptionGrantsAccess(
	subscription:
		| {
				status: string
				endDate?: Date | null
				asaasCreditCardToken?: string | null
		  }
		| null
		| undefined,
	now: Date,
	trialEnd: Date,
): { allowed: boolean; cardRequired: boolean } {
	if (!subscription) {
		if (now <= trialEnd) return { allowed: true, cardRequired: false }
		return { allowed: false, cardRequired: false }
	}

	const hasPaidPeriodLeft =
		subscription.status === 'CANCELED' &&
		subscription.endDate != null &&
		subscription.endDate > now

	if (subscription.status === 'ACTIVE' || hasPaidPeriodLeft) {
		return { allowed: true, cardRequired: false }
	}

	if (subscription.status === 'TRIALING' && now <= trialEnd) {
		return { allowed: true, cardRequired: false }
	}

	return { allowed: false, cardRequired: false }
}
