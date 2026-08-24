import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

vi.mock('disposable-email-domains', () => ({
	default: ['mailinator.com', 'tempmail.com'],
}))

const resolveMx = vi.fn()

vi.mock('node:dns/promises', () => ({
	default: {
		resolveMx: (...args: unknown[]) => resolveMx(...args),
	},
	resolveMx: (...args: unknown[]) => resolveMx(...args),
}))

describe('validateEmail', () => {
	beforeEach(() => {
		resolveMx.mockReset()
		vi.resetModules()
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	it('rejeita e-mail sem domínio', async () => {
		const { validateEmail } = await import(
			'@/shared/services/emailValidationService'
		)
		const res = await validateEmail('sem-arroba')
		expect(res.valid).toBe(false)
		expect(res.reason).toBe('missing_domain')
	})

	it('rejeita domínio descartável', async () => {
		const { validateEmail } = await import(
			'@/shared/services/emailValidationService'
		)
		const res = await validateEmail('a@mailinator.com')
		expect(res.valid).toBe(false)
		expect(res.reason).toBe('disposable')
		expect(resolveMx).not.toHaveBeenCalled()
	})

	it('rejeita quando DNS falha / sem MX', async () => {
		resolveMx.mockRejectedValueOnce(new Error('ENOTFOUND'))
		const { validateEmail } = await import(
			'@/shared/services/emailValidationService'
		)
		const res = await validateEmail('user@dominio-inexistente.invalid')
		expect(res.valid).toBe(false)
		expect(res.reason).toBe('dns_error')
	})

	it('aceita domínio com MX', async () => {
		resolveMx.mockResolvedValueOnce([{ exchange: 'mx.example.com', priority: 10 }])
		const { validateEmail } = await import(
			'@/shared/services/emailValidationService'
		)
		const res = await validateEmail('dono@example.com')
		expect(res.valid).toBe(true)
	})
})
