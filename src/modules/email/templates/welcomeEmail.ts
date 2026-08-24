import { emailLayout, frontendUrl } from './emailLayout'
import type { SendEmailInput } from '@/shared/container/providers/EmailProvider/IEmailProvider'

export function buildWelcomeEmail(input: {
	ownerName: string
	barbershopName: string
	email: string
}): SendEmailInput {
	const appUrl = frontendUrl('/app/queue')
	const plansUrl = frontendUrl('/planos')
	const title = `Bem-vindo(a) ao AGENDAI, ${input.ownerName.split(' ')[0]}!`
	const bodyHtml = `
    <p>Seu salão <strong style="color:#171717;">${escapeHtml(input.barbershopName)}</strong> já está no ar.</p>
    <p>Você tem <strong style="color:#171717;">30 dias de Pro</strong> — em qualquer plano. Use o painel completo e veja se faz sentido para o seu salão.</p>
    <p>Comece pela fila do dia. Ao fim dos 30 dias, segue o plano que você escolheu.</p>
  `
	const text = [
		title,
		'',
		`Seu salão ${input.barbershopName} já está no ar.`,
		'Você tem 30 dias de Pro — em qualquer plano. Veja se faz sentido para o seu salão.',
		`Painel: ${appUrl}`,
		`Planos: ${plansUrl}`,
	].join('\n')

	return {
		to: input.email,
		subject: `Bem-vindo ao AGENDAI — ${input.barbershopName}`,
		html: emailLayout({
			title,
			bodyHtml,
			ctaLabel: 'Abrir meu painel',
			ctaUrl: appUrl,
		}),
		text,
		template: 'welcome',
		metadata: { barbershopName: input.barbershopName },
	}
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
}
