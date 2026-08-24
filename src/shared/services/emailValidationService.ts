import dns from 'node:dns/promises'
import disposableDomains from 'disposable-email-domains'

const MX_TIMEOUT_MS = 2500

const disposableSet = new Set(
	(disposableDomains as string[]).map((d) => d.toLowerCase()),
)

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined
	try {
		return await Promise.race([
			promise,
			new Promise<T>((_, reject) => {
				timer = setTimeout(() => reject(new Error('timeout')), ms)
			}),
		])
	} finally {
		if (timer) clearTimeout(timer)
	}
}

/**
 * Valida e-mail contra domínios descartáveis e presença de MX.
 * Motivos internos nunca devem ir para a API (mensagem genérica no caller).
 */
export async function validateEmail(
	email: string,
): Promise<{ valid: boolean; reason?: string }> {
	const domain = email.split('@')[1]?.toLowerCase().trim()
	if (!domain) return { valid: false, reason: 'missing_domain' }

	if (disposableSet.has(domain)) {
		return { valid: false, reason: 'disposable' }
	}

	try {
		const mxRecords = await withTimeout(dns.resolveMx(domain), MX_TIMEOUT_MS)
		if (!mxRecords || mxRecords.length === 0) {
			return { valid: false, reason: 'no_mx' }
		}
	} catch {
		return { valid: false, reason: 'dns_error' }
	}

	return { valid: true }
}
