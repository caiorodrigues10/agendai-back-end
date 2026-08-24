import { describe, expect, it } from 'vitest'
import { buildWelcomeEmail } from './welcomeEmail'
import { buildReferralConvertedEmail } from './referralEmails'

describe('email templates', () => {
	it('buildWelcomeEmail inclui nome do salão e CTAs', () => {
		const mail = buildWelcomeEmail({
			ownerName: 'Maria Silva',
			barbershopName: 'Studio Glow',
			email: 'maria@example.com',
		})
		expect(mail.to).toBe('maria@example.com')
		expect(mail.template).toBe('welcome')
		expect(mail.subject).toContain('Studio Glow')
		expect(mail.html).toContain('Studio Glow')
		expect(mail.html).toContain('30 dias')
		expect(mail.html).toContain('Pro')
		expect(mail.html).toContain('salão')
		expect(mail.text).toContain('/app/queue')
	})

	it('buildReferralConvertedEmail cita recompensa', () => {
		const mail = buildReferralConvertedEmail({
			referrerName: 'João',
			referrerEmail: 'joao@example.com',
			refereeShopName: 'Barbearia Norte',
			rewardDays: 30,
		})
		expect(mail.template).toBe('referral_converted')
		expect(mail.html).toContain('Barbearia Norte')
		expect(mail.html).toContain('30 dias')
		expect(mail.subject).toContain('+30')
	})
})
