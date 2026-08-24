import type { SendEmailInput } from '@/shared/container/providers/EmailProvider/IEmailProvider'
import { emailLayout } from './emailLayout'

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
}

function apiUrl(path = ''): string {
	const base = (
		process.env.API_PUBLIC_URL ||
		process.env.BACKEND_URL ||
		'http://localhost:3333'
	).replace(/\/$/, '')
	if (!path) return base
	return `${base}${path.startsWith('/') ? path : `/${path}`}`
}

export function buildVerifyEmail(input: {
	ownerName: string
	email: string
	token: string
}): SendEmailInput {
	const title = 'Verifique seu e-mail'
	// Link bate na API (redirect para /email-verificado no front)
	const verifyUrl = apiUrl(`/api/auth/verify-email?token=${encodeURIComponent(input.token)}`)
	const bodyHtml = `
    <p>Olá, <strong style="color:#171717;">${escapeHtml(input.ownerName.split(' ')[0])}</strong>!</p>
    <p>Clique no botão abaixo para verificar seu e-mail e ativar sua conta:</p>
  `
	const text = [title, `Acesse: ${verifyUrl}`].join('\n')

	return {
		to: input.email,
		subject: 'Verifique seu e-mail — AGENDAI',
		html: emailLayout({
			title,
			bodyHtml,
			ctaLabel: 'Verificar e-mail',
			ctaUrl: verifyUrl,
		}),
		text,
		template: 'verify_email',
	}
}
