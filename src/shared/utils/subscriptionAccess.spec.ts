import { describe, expect, it } from 'vitest'
import {
	shouldBlockOwnerCpfsOnDeniedAccess,
	subscriptionGrantsAccess,
} from '@/shared/utils/subscriptionAccess'

describe('subscriptionGrantsAccess', () => {
	const now = new Date('2026-08-22T12:00:00Z')
	const trialEnd = new Date('2026-09-20T12:00:00Z')

	it('libera trial sem assinatura dentro do calendário', () => {
		const r = subscriptionGrantsAccess(null, now, trialEnd)
		expect(r).toEqual({ allowed: true, cardRequired: false })
	})

	it('bloqueia sem assinatura após fim do trial', () => {
		const after = new Date('2026-09-21T12:00:00Z')
		const r = subscriptionGrantsAccess(null, after, trialEnd)
		expect(r).toEqual({ allowed: false, cardRequired: false })
	})

	it('libera TRIALING com token vaulted dentro do trial', () => {
		const r = subscriptionGrantsAccess(
			{
				status: 'TRIALING',
				endDate: trialEnd,
				asaasCreditCardToken: 'tok_abc',
			},
			now,
			trialEnd,
		)
		expect(r.allowed).toBe(true)
		expect(r.cardRequired).toBe(false)
	})

	it('libera TRIALING sem token dentro do trial (cartão opcional)', () => {
		const r = subscriptionGrantsAccess(
			{ status: 'TRIALING', endDate: trialEnd, asaasCreditCardToken: null },
			now,
			trialEnd,
		)
		expect(r).toEqual({ allowed: true, cardRequired: false })
	})

	it('libera ACTIVE sem exigir token Asaas', () => {
		const r = subscriptionGrantsAccess(
			{ status: 'ACTIVE', endDate: null, asaasCreditCardToken: null },
			now,
			trialEnd,
		)
		expect(r.allowed).toBe(true)
	})

	it('bloqueia TRIALING após fim do trial', () => {
		const after = new Date('2026-09-21T12:00:00Z')
		const r = subscriptionGrantsAccess(
			{
				status: 'TRIALING',
				endDate: trialEnd,
				asaasCreditCardToken: 'tok_abc',
			},
			after,
			trialEnd,
		)
		expect(r.allowed).toBe(false)
		expect(r.cardRequired).toBe(false)
	})

	it('após o trial sem pagamento, cardRequired é false (login não 402; APIs sim)', () => {
		const after = new Date('2026-09-21T12:00:00Z')
		const r = subscriptionGrantsAccess(null, after, trialEnd)
		expect(r.allowed).toBe(false)
		expect(r.cardRequired).toBe(false)
	})
})

describe('shouldBlockOwnerCpfsOnDeniedAccess', () => {
	it('não bloqueia CPF só porque o trial acabou (sem assinatura)', () => {
		expect(shouldBlockOwnerCpfsOnDeniedAccess(undefined)).toBe(false)
		expect(shouldBlockOwnerCpfsOnDeniedAccess('TRIALING')).toBe(false)
		expect(shouldBlockOwnerCpfsOnDeniedAccess('CANCELED')).toBe(false)
	})

	it('bloqueia CPF em inadimplência real', () => {
		expect(shouldBlockOwnerCpfsOnDeniedAccess('PAST_DUE')).toBe(true)
		expect(shouldBlockOwnerCpfsOnDeniedAccess('UNPAID')).toBe(true)
	})
})
