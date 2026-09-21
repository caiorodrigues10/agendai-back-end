import type { SendEmailInput } from '@/shared/container/providers/EmailProvider/IEmailProvider'
import { agendaiEmailBase } from './agendaiEmailLayout'
import { getFrontendUrl } from '@/shared/constants/env'

function esc(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
}

function formatDate(value: Date | string): string {
 const date = new Date(value);
 if (!Number.isFinite(date.getTime())) throw new Error('Data inválida no e-mail');
 return date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function frontend(path = ''): string {
	const base = getFrontendUrl().replace(/\/$/, '')
	return `${base}${path.startsWith('/') ? path : `/${path}`}`
}

// ─── AUTH ──────────────────────────────────────────────────────

export function buildPasswordChangedEmail(input: {
	ownerName: string
	email: string
}): SendEmailInput {
	const title = 'Senha alterada com sucesso'
	return {
		to: input.email,
		subject: 'Sua senha foi alterada — AgendAI',
		text: [
			'Olá, ' + input.ownerName.split(' ')[0] + '!',
			'',
			'A senha da sua conta AgendAI foi alterada com sucesso.',
			'',
			'Se você não fez esta mudança, redefina sua senha imediatamente.',
			'',
			'Acesse: ' + frontend('/esqueci-senha'),
		].join('\n'),
		html: agendaiEmailBase({
			title,
			preheader: 'A senha da sua conta foi atualizada.',
			bodyHtml:
				`<p>Olá, <strong>${esc(input.ownerName.split(' ')[0])}</strong>!</p>` +
				`<p>Sua senha foi alterada com sucesso. Se você reconhece esta alteração, nenhuma ação é necessária.</p>` +
				`<p>Se você <strong>não</strong> fez esta mudança, <a href="${frontend('/esqueci-senha')}" style="color:#1C7E61;">acesse a recuperação de senha</a> para redefinir sua senha imediatamente.</p>`,
			ctaLabel: 'Redefinir senha',
			ctaUrl: frontend('/esqueci-senha'),
			receivedBy: input.email,
		}),
		template: 'password_changed',
	}
}

// ─── ASSINATURA / FATURAMENTO ─────────────────────────────────

export function buildPaymentApprovedEmail(input: {
	ownerName: string
	email: string
	planName: string
	amount: number
	nextBillingDate?: Date | string | null
}): SendEmailInput {
	const title = 'Pagamento aprovado'
	const formatted = new Intl.NumberFormat('pt-BR', {
		style: 'currency',
		currency: 'BRL',
	}).format(input.amount)
	const nextDate = input.nextBillingDate
		? formatDate(input.nextBillingDate)
		: null
	return {
		to: input.email,
		subject: `Pagamento confirmado — ${input.planName}`,
		text: [
			'Pagamento aprovado!',
			'',
			`Plano: ${input.planName}`,
			`Valor: ${formatted}`,
			nextDate ? `Próxima renovação: ${nextDate}` : '',
			'',
			'Acesse: ' + frontend('/app/appointments'),
		].join('\n'),
		html: agendaiEmailBase({
			title,
			preheader: `Pagamento de ${formatted} aprovado — ${input.planName}`,
			bodyHtml:
				`<p>Olá, <strong>${esc(input.ownerName.split(' ')[0])}</strong>!</p>` +
				`<p>Seu pagamento foi aprovado com sucesso.</p>` +
				`<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:12px 0;background:#F4F7F4;border-radius:8px;">` +
				`<tr><td style="padding:12px 16px;">` +
				`<p style="margin:0;font-size:13px;color:#4D5F55;">Plano</p>` +
				`<p style="margin:4px 0 0;font-weight:700;font-size:16px;">${esc(input.planName)}</p>` +
				`</td><td style="padding:12px 16px;text-align:right;">` +
				`<p style="margin:0;font-size:13px;color:#4D5F55;">Valor</p>` +
				`<p style="margin:4px 0 0;font-weight:700;font-size:16px;">${formatted}</p>` +
				`</td></tr></table>` +
				(nextDate ? `<p>A próxima renovação está marcada para <strong>${esc(nextDate)}</strong>.</p>` : '') +
				`<p style="font-size:13px;color:#4D5F55;">Você pode conferir todos os detalhes na aba Plano do painel.</p>`,
			ctaLabel: 'Ver meu painel',
			ctaUrl: frontend('/app/appointments'),
			receivedBy: input.email,
		}),
		template: 'payment_approved',
		metadata: { planName: input.planName, amount: input.amount },
		tags: { module: 'subscriptions', kind: 'payment_approved' },
	}
}

export function buildPaymentFailedEmail(input: {
	ownerName: string
	email: string
	planName: string
	reason?: string | null
	retryUrl?: string
}): SendEmailInput {
	const title = 'Problema no pagamento'
	const retryLink = input.retryUrl ?? frontend('/app/subscription')
	return {
		to: input.email,
		subject: 'Pagamento não processado — AgendAI',
		text: [
			'Olá, ' + input.ownerName.split(' ')[0] + '!',
			'',
			'Não conseguimos processar sua cobrança do plano ' + input.planName + '.',
			'',
			'Sem uma nova tentativa de pagamento, o acesso ao painel pode ser interrompido.',
			'',
			'Tentar novamente: ' + retryLink,
		].join('\n'),
		html: agendaiEmailBase({
			title,
			preheader: `Falha na cobrança do plano ${input.planName}.`,
			bodyHtml:
				`<p>Olá, <strong>${esc(input.ownerName.split(' ')[0])}</strong>.</p>` +
				`<p>Não conseguimos confirmar seu pagamento do plano <strong>${esc(input.planName)}</strong>.</p>` +
				(input.reason ? `<p>Motivo informado pela operadora: <em>${esc(input.reason)}</em></p>` : '') +
				`<p>Para não perder o acesso ao painel, agende um novo pagamento.</p>`,
			ctaLabel: 'Tentar pagamento novamente',
			ctaUrl: retryLink,
			receivedBy: input.email,
		}),
		template: 'payment_failed',
		metadata: { planName: input.planName },
		tags: { module: 'subscriptions', kind: 'payment_failed' },
	}
}

export function buildSubscriptionTrialEndingEmail(input: {
	ownerName: string
	email: string
	planName: string
	amount: number
	daysLeft: number
}): SendEmailInput {
	const title = `Seu período grátis termina em ${input.daysLeft} dias`
	const price = new Intl.NumberFormat('pt-BR', {
		style: 'currency',
		currency: 'BRL',
	}).format(input.amount)
	return {
		to: input.email,
		subject: `${input.daysLeft} dias restantes de teste — AgendAI`,
		text: [
			`Olá, ${input.ownerName.split(' ')[0]}!`,
			'',
			`Seu período gratuito do AgendAI termina em ${input.daysLeft} dias.`,
			`Plano: ${input.planName} · ${price}/mês.`,
			'',
			'Continue usando: ' + frontend('/app/subscription'),
		].join('\n'),
		html: agendaiEmailBase({
			title,
			preheader: `Faltam ${input.daysLeft} dias para o fim do período grátis.`,
			bodyHtml:
				`<p>Olá, <strong>${esc(input.ownerName.split(' ')[0])}</strong>!</p>` +
				`<p>Seu período de testes do AgendAI está se encerrando. Faltam <strong>${input.daysLeft} dias</strong>.</p>` +
				`<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:12px 0;background:#F4F7F4;border-radius:8px;">` +
				`<tr><td style="padding:12px 16px;">` +
				`<p style="margin:0;font-size:13px;color:#4D5F55;">Plano selecionado</p>` +
				`<p style="margin:4px 0 0;font-weight:700;font-size:16px;">${esc(input.planName)}</p>` +
				`</td><td style="padding:12px 16px;text-align:right;">` +
				`<p style="margin:0;font-size:13px;color:#4D5F55;">Investimento</p>` +
				`<p style="margin:4px 0 0;font-weight:700;font-size:16px;">${price}<span style="font-size:13px;font-weight:400;color:#4D5F55;">/mês</span></p>` +
				`</td></tr></table>` +
				`<p>Para continuar usando a fila, a agenda e todas as funções, basta manter o plano ativo.</p>`,
			ctaLabel: 'Ver planos',
			ctaUrl: frontend('/app/subscription'),
			receivedBy: input.email,
		}),
		template: 'subscription_trial_ending',
		metadata: { daysLeft: input.daysLeft, planName: input.planName },
		tags: { module: 'subscriptions', kind: 'trial_ending' },
	}
}

export function buildSubscriptionCanceledEmail(input: {
	ownerName: string
	email: string
	planName: string
	endDate?: Date | string | null
}): SendEmailInput {
	const title = 'Assinatura cancelada'
	const endDate = input.endDate
		? formatDate(input.endDate)
		: null
	return {
		to: input.email,
		subject: 'Assinatura cancelada — AgendAI',
		text: [
			'Olá, ' + input.ownerName.split(' ')[0] + '.',
			'',
			`A assinatura do plano ${input.planName} foi cancelada.`,
			endDate ? `Acesso válido até: ${endDate}.` : '',
			'',
			'Reativar: ' + frontend('/app/subscription'),
		].join('\n'),
		html: agendaiEmailBase({
			title,
			preheader: `Sua assinatura do plano ${input.planName} foi cancelada.`,
			bodyHtml:
				`<p>Olá, <strong>${esc(input.ownerName.split(' ')[0])}</strong>.</p>` +
				`<p>Confirmamos o cancelamento da sua assinatura do plano <strong>${esc(input.planName)}</strong>.</p>` +
				(endDate
					? `<p style="margin-top:12px;padding:16px;border-radius:8px;background:#F4F7F4;">` +
						`Você continua com acesso até <strong>${esc(endDate)}</strong>.</p>`
					: '') +
				`<p>Caso queira reativar, você pode assinar novamente a qualquer momento pela aba Planos do painel.</p>`,
			ctaLabel: 'Ver planos',
			ctaUrl: frontend('/app/subscription'),
			receivedBy: input.email,
		}),
		template: 'subscription_canceled',
		metadata: { planName: input.planName },
		tags: { module: 'subscriptions', kind: 'canceled' },
	}
}

export function buildSubscriptionRenewedEmail(input: {
	ownerName: string
	email: string
	planName: string
	amount: number
	nextBillingDate?: Date | string | null
}): SendEmailInput {
	const title = 'Assinatura renovada'
	const formatted = new Intl.NumberFormat('pt-BR', {
		style: 'currency',
		currency: 'BRL',
	}).format(input.amount)
	return {
		to: input.email,
		subject: `Renovação confirmada — ${input.planName}`,
		text: [
			'Olá, ' + input.ownerName.split(' ')[0] + '!',
			`Renovamos sua assinatura do plano ${input.planName}.`,
			`Valor: ${formatted}`,
			'',
			'Acesse: ' + frontend('/app/appointments'),
		].join('\n'),
		html: agendaiEmailBase({
			title,
			preheader: `Seu plano ${input.planName} foi renovado.`,
			bodyHtml:
				`<p>Olá, <strong>${esc(input.ownerName.split(' ')[0])}</strong>!</p>` +
				`<p>Sua assinatura do plano <strong>${esc(input.planName)}</strong> foi renovada com sucesso.</p>` +
				`<p style="margin-top:12px;padding:16px;border-radius:8px;background:#F4F7F4;">` +
				`Cobrança aprovada no valor de <strong>${formatted}</strong>.` +
				(input.nextBillingDate
					? ` Próxima renovação: <strong>${esc(formatDate(input.nextBillingDate))}</strong>.`
					: '') +
				`</p>`,
			ctaLabel: 'Abrir meu painel',
			ctaUrl: frontend('/app/appointments'),
			receivedBy: input.email,
		}),
		template: 'subscription_renewed',
		metadata: { planName: input.planName, amount: input.amount },
		tags: { module: 'subscriptions', kind: 'renewed' },
	}
}

export function buildWelcomeStaffEmail(input: {
	staffName: string
	barbershopName: string
	email: string
	inviteUrl: string
}): SendEmailInput {
	const title = `Você foi adicionado ao ${input.barbershopName}`
	return {
		to: input.email,
		subject: `Bem-vindo à equipe ${input.barbershopName} — AgendAI`,
		text: [
			`Olá, ${input.staffName.split(' ')[0]}!`,
			'',
			`Você foi convidado para a equipe de ${input.barbershopName} no AgendAI.`,
			'',
			'Aceite o convite: ' + input.inviteUrl,
		].join('\n'),
		html: agendaiEmailBase({
			title,
			preheader: `Convite para a equipe de ${input.barbershopName}.`,
			bodyHtml:
				`<p>Olá, <strong>${esc(input.staffName.split(' ')[0])}</strong>!</p>` +
				`<p>Você foi convidado para fazer parte da equipe de <strong>${esc(input.barbershopName)}</strong> no AgendAI.</p>` +
				`<p>Clique abaixo para configurar seu acesso e ver seus horários e comissões.</p>`,
			ctaLabel: 'Aceitar convite',
			ctaUrl: input.inviteUrl,
			receivedBy: input.email,
		}),
		template: 'welcome_staff',
		metadata: { barbershopName: input.barbershopName },
		tags: { module: 'staff', kind: 'welcome' },
	}
}

export function buildSubscriptionTrialEndedEmail(input: {
	ownerName: string
	email: string
	planName: string
	amount: number
	graceDays: number
}): SendEmailInput {
	const title = 'Seu período grátis terminou'
	const price = new Intl.NumberFormat('pt-BR', {
		style: 'currency',
		currency: 'BRL',
	}).format(input.amount)
	return {
		to: input.email,
		subject: 'Seu teste grátis acabou — AgendAI',
		text: [
			`Olá, ${input.ownerName.split(' ')[0]}.`,
			'',
			`Seu período de testes acabou.`,
			`Seu plano é ${input.planName} (${price}/mês).`,
			`Você tem ${input.graceDays} dia${input.graceDays === 1 ? '' : 's'} para regularizar antes da suspensão.`,
			'',
			'Regularizar: ' + frontend('/app/subscription'),
		].join('\n'),
		html: agendaiEmailBase({
			title,
			preheader: `O período grátis acabou — regularize em ${input.graceDays} dias.`,
			bodyHtml:
				`<p>Olá, <strong>${esc(input.ownerName.split(' ')[0])}</strong>.</p>` +
				`<p>Seu período grátis do AgendAI acabou. O plano selecionado é <strong>${esc(input.planName)}</strong> (${price}/mês).</p>` +
				`<p style="margin-top:12px;padding:16px;border-radius:8px;background:#FEF3C7;color:#92400E;">` +
				`<strong>Importante:</strong> você tem <strong>${input.graceDays} dia${input.graceDays === 1 ? '' : 's'}</strong> de carência antes do acesso ser suspenso.</p>` +
				`<p>Para continuar com a fila, a agenda e todas as funções, regularize seu plano.</p>`,
			ctaLabel: 'Regularizar assinatura',
			ctaUrl: frontend('/app/subscription'),
			receivedBy: input.email,
		}),
		template: 'subscription_trial_ended',
		metadata: { planName: input.planName },
		tags: { module: 'subscriptions', kind: 'trial_ended' },
	}
}

export function buildSubscriptionRenewalFailedEmail(input: {
	ownerName: string
	email: string
	planName: string
	reason?: string | null
	retryUrl?: string
}): SendEmailInput {
	const title = 'Renovação não processada'
	const retryLink = input.retryUrl ?? frontend('/app/subscription')
	return {
		to: input.email,
		subject: 'Não conseguimos renovar sua assinatura — AgendAI',
		text: [
			`Olá, ${input.ownerName.split(' ')[0]}.`,
			'',
			`Não conseguimos renovar sua assinatura do plano ${input.planName}.`,
			'Sem regularizar, o acesso pode ser suspenso.',
			'',
			'Regularizar: ' + retryLink,
		].join('\n'),
		html: agendaiEmailBase({
			title,
			preheader: `Falha ao renovar o plano ${input.planName}.`,
			kicker: 'Ação necessária',
			bodyHtml:
				`<p>Olá, <strong>${esc(input.ownerName.split(' ')[0])}</strong>.</p>` +
				`<p>A renovação automática do seu plano <strong>${esc(input.planName)}</strong> não foi processada.</p>` +
				(input.reason ? `<p>Motivo: <em>${esc(input.reason)}</em></p>` : '') +
				`<p>Se não regularizarmos, o salão perde o acesso à fila e à agenda.</p>`,
			ctaLabel: 'Regularizar pagamento',
			ctaUrl: retryLink,
			receivedBy: input.email,
		}),
		template: 'subscription_renewal_failed',
		metadata: { planName: input.planName },
		tags: { module: 'subscriptions', kind: 'renewal_failed' },
	}
}

// ─── AGENDA / OPERAÇÃO ─────────────────────────────────────────

export function buildDailyDigestEmail(input: {
	ownerName: string
	email: string
	date: string // YYYY-MM-DD
	appointments: {
		time: string
		clientName: string
		serviceName: string
		price?: number | null
		staffName?: string | null
		notes?: string | null
	}[]
	totalScheduled: number
	cancelledToday: number
	nextAvailableSlot?: string | null
}): SendEmailInput {
	const title = `Resumo do dia — ${input.date}`
	const appointmentsHtml = input.appointments
		.map(
			(a) =>
				`<tr>
					<td style="padding:10px 4px 10px 0;border-bottom:1px solid #E2E8E2;font-weight:700;white-space:nowrap;vertical-align:top;">${esc(a.time)}</td>
					<td style="padding:10px 4px;border-bottom:1px solid #E2E8E2;">
						<strong>${esc(a.clientName)}</strong><br/>
						<span style="font-size:13px;color:#4D5F55;">${esc(a.serviceName)}${a.price != null ? ' — ' + esc(new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(a.price)) : ''}</span>
						${a.staffName ? `<br/><span style="font-size:12px;color:#4D5F55;">${esc('com ' + a.staffName)}</span>` : ''}
						${a.notes ? `<br/><span style="font-size:12px;color:#4D5F55;font-style:italic;">${esc(a.notes)}</span>` : ''}
					</td>
				</tr>`
		)
		.join('')

	const cancelledNote =
		input.cancelledToday > 0
			? `<p style="margin:12px 0;padding:12px;border-radius:8px;background:#FDF2F2;color:#B91C1C;">
				<strong>${input.cancelledToday}</strong> agendamento${input.cancelledToday === 1 ? '' : 's'} foram cancelado${input.cancelledToday === 1 ? '' : 's'} hoje.
			</p>`
			: ''

	const nextSlotInfo = input.nextAvailableSlot
		? `<p style="margin:12px 0;padding:12px;border-radius:8px;background:#F0F7F4;">
			Próximo horário disponível: <strong>${esc(input.nextAvailableSlot)}</strong>
		</p>`
		: ''

	return {
		to: input.email,
		subject: `Agenda de hoje (${input.date}) — ${input.totalScheduled} agendamento${input.totalScheduled === 1 ? '' : 's'}`,
		text: [
			`Resumo do dia — ${input.date}`,
			'',
			`${input.totalScheduled} agendamento${input.totalScheduled === 1 ? '' : 's'} hoje.`,
			...(input.appointments.map(
				(a) => `• ${a.time} — ${a.clientName} (${a.serviceName})`
			)),
			input.cancelledToday > 0 ? `${input.cancelledToday} cancelado(s).` : '',
			'',
			'Acesse: ' + frontend('/app/appointments'),
		].join('\n'),
		html: agendaiEmailBase({
			title,
			preheader: `${input.totalScheduled} agendamento${input.totalScheduled === 1 ? '' : 's'} hoje — resumo.`,
			kicker: input.date,
			bodyHtml:
				`<p>Olá, <strong>${esc(input.ownerName.split(' ')[0])}</strong>!</p>` +
				`<p>Você tem <strong>${input.totalScheduled}</strong> agendamento${input.totalScheduled === 1 ? '' : 's'} na agenda de hoje.</p>` +
				cancelledNote +
				nextSlotInfo +
				'<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin-top:8px;">' +
					'<thead><tr>' +
						'<th style="text-align:left;padding:4px 4px 8px;border-bottom:2px solid #1C7E61;font-size:12px;color:#4D5F55;text-transform:uppercase;letter-spacing:0.06em;">Horário</th>' +
						'<th style="text-align:left;padding:4px 0 8px;border-bottom:2px solid #1C7E61;font-size:12px;color:#4D5F55;">Cliente / Serviço</th>' +
					'</tr></thead>' +
					'<tbody style="font-size:14px;">' + appointmentsHtml + '</tbody>' +
				'</table>',
			ctaLabel: 'Abrir agenda completa',
			ctaUrl: frontend('/app/appointments'),
			receivedBy: input.email,
		}),
		template: 'daily_digest',
		metadata: {
			date: input.date,
			totalScheduled: input.totalScheduled,
			cancelledToday: input.cancelledToday,
		},
		tags: { module: 'appointments', kind: 'daily_digest' },
	}
}

// ─── URGENTES (cancelamento/remarcação 24h) ───────────────────

export function buildAppointmentUrgentCancelledEmail(input: {
	ownerName: string
	email: string
	cancelledBy: 'CLIENTE' | 'SALAO'
	clientName?: string
	serviceName?: string
	originalTime: string // HH:MM
}): SendEmailInput {
	const title = 'Cancelamento urgente'
	const who = input.cancelledBy === 'CLIENTE' ? 'o cliente' : 'o salão'
	return {
		to: input.email,
		subject: `Cancelamento urgente às ${input.originalTime} — AgendAI`,
		text: [
			'Cancelamento urgente:',
			'',
			`O agendamento das ${input.originalTime} foi cancelado por ${who}.`,
			`Serviço: ${input.serviceName ?? '—'}`,
			`Cliente: ${input.clientName ?? '—'}`,
			'',
			'Acesse o painel para remanejar: ' + frontend('/app/appointments'),
		].join('\n'),
		html: agendaiEmailBase({
			title,
			preheader: `Agendamento das ${input.originalTime} cancelado por ${who}.`,
			kicker: 'AÇÃO NECESSÁRIA',
			bodyHtml:
				`<p>O agendamento das <strong>${esc(input.originalTime)}</strong> foi ${input.cancelledBy === 'CLIENTE' ? 'cancelado pelo cliente' : 'cancelado pelo salão'}.</p>` +
				(input.clientName ? `<p>Cliente: <strong>${esc(input.clientName)}</strong></p>` : '') +
				(input.serviceName ? `<p>Serviço: ${esc(input.serviceName)}</p>` : '') +
				`<p>Abra o painel para identificar e remanejar.</p>`,
			ctaLabel: 'Abrir agenda',
			ctaUrl: frontend('/app/appointments'),
			receivedBy: input.email,
		}),
		template: 'appointment_urgent_cancelled',
		metadata: { originalTime: input.originalTime, cancelledBy: input.cancelledBy },
		tags: { module: 'appointments', kind: 'urgent_cancelled' },
	}
}

export function buildAppointmentUrgentRescheduledEmail(input: {
	ownerName: string
	email: string
	originalTime: string
	newTime: string
	clientName?: string
	serviceName?: string
}): SendEmailInput {
	const title = 'Agendamento remarcado'
	return {
		to: input.email,
		subject: `Reagendado: ${input.originalTime} → ${input.newTime} — AgendAI`,
		text: [
			'Agendamento reagendado:',
			'',
			`${input.originalTime} → ${input.newTime}`,
			`Cliente: ${input.clientName ?? '—'}`,
			`Serviço: ${input.serviceName ?? '—'}`,
			'',
			'Acesse: ' + frontend('/app/appointments'),
		].join('\n'),
		html: agendaiEmailBase({
			title,
			preheader: `Novo horário: ${input.newTime} (era ${input.originalTime}).`,
			bodyHtml:
				`<p>O agendamento foi <strong>reagendado</strong>.</p>` +
				`<div style="margin:12px 0;padding:16px;border-radius:8px;background:#F0F7F4;text-align:center;">` +
				`<p style="margin:0;font-size:13px;color:#4D5F55;">De</p>` +
				`<p style="margin:4px 0;font-size:22px;font-weight:800;color:#1C7E61;text-decoration:line-through;">${esc(input.originalTime)}</p>` +
				`<p style="margin:8px 0;font-size:13px;color:#4D5F55;">Para</p>` +
				`<p style="margin:0;font-size:26px;font-weight:900;">${esc(input.newTime)}</p>` +
				`</div>` +
				(input.clientName ? `<p>Cliente: <strong>${esc(input.clientName)}</strong></p>` : '') +
				(input.serviceName ? `<p>Serviço: ${esc(input.serviceName)}</p>` : ''),
			ctaLabel: 'Ver na agenda',
			ctaUrl: frontend('/app/appointments'),
			receivedBy: input.email,
		}),
		template: 'appointment_urgent_rescheduled',
		metadata: { originalTime: input.originalTime, newTime: input.newTime },
		tags: { module: 'appointments', kind: 'urgent_rescheduled' },
	}
}
