import { REFERRAL_REWARD_DAYS } from '@/shared/constants/referral'
import type { SendEmailInput } from '@/shared/container/providers/EmailProvider/IEmailProvider'
import { emailLayout, frontendUrl } from './emailLayout'

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
}

export function buildReferralAppliedEmail(input: {
	ownerName: string
	email: string
	referrerShopName: string
}): SendEmailInput {
	const title = 'Seu cadastro veio de uma indicação'
	const bodyHtml = `
    <p>Olá, <strong style="color:#171717;">${escapeHtml(input.ownerName.split(' ')[0])}</strong>!</p>
    <p>Você entrou pelo link de <strong style="color:#171717;">${escapeHtml(input.referrerShopName)}</strong>.</p>
    <p>Quando sua assinatura for ativada com o primeiro pagamento, quem te indicou ganha
    <strong style="color:#171717;">${REFERRAL_REWARD_DAYS} dias</strong> a mais na conta.</p>
  `
	const text = [
		title,
		`Você entrou pelo link de ${input.referrerShopName}.`,
		`Quando pagar, o indicador ganha ${REFERRAL_REWARD_DAYS} dias.`,
	].join('\n')

	return {
		to: input.email,
		subject: 'Indicação aplicada na sua conta AGENDAI',
		html: emailLayout({
			title,
			bodyHtml,
			ctaLabel: 'Ir para o painel',
			ctaUrl: frontendUrl('/app/queue'),
		}),
		text,
		template: 'referral_applied',
	}
}

export function buildReferralConvertedEmail(input: {
	referrerName: string
	referrerEmail: string
	refereeShopName: string
	rewardDays: number
}): SendEmailInput {
	const title = 'Sua indicação converteu!'
	const bodyHtml = `
    <p>Olá, <strong style="color:#171717;">${escapeHtml(input.referrerName.split(' ')[0])}</strong>!</p>
    <p>O salão <strong style="color:#171717;">${escapeHtml(input.refereeShopName)}</strong> assinou o AGENDAI.</p>
    <p>Creditamos <strong style="color:#171717;">${input.rewardDays} dias</strong> na sua assinatura. Obrigado por indicar!</p>
  `
	const text = [
		title,
		`${input.refereeShopName} assinou o AGENDAI.`,
		`+${input.rewardDays} dias creditados na sua assinatura.`,
	].join('\n')

	return {
		to: input.referrerEmail,
		subject: `Indicação convertida — +${input.rewardDays} dias no AGENDAI`,
		html: emailLayout({
			title,
			bodyHtml,
			ctaLabel: 'Ver minhas indicações',
			ctaUrl: frontendUrl('/app/referrals'),
		}),
		text,
		template: 'referral_converted',
		metadata: { refereeShopName: input.refereeShopName, rewardDays: input.rewardDays },
	}
}

export function buildReferralRevokedEmail(input: {
	referrerName: string
	referrerEmail: string
	refereeShopName: string
	revokedDays: number
}): SendEmailInput {
	const title = 'Indicação revertida'
	const bodyHtml = `
    <p>Olá, <strong style="color:#171717;">${escapeHtml(input.referrerName.split(' ')[0])}</strong>!</p>
    <p>O salão <strong style="color:#171717;">${escapeHtml(input.refereeShopName)}</strong> cancelou a assinatura.</p>
    <p>Por isso, <strong style="color:#171717;">${input.revokedDays} dias</strong> foram removidos da sua assinatura.</p>
  `
	const text = [
		title,
		`${input.refereeShopName} cancelou.`,
		`-${input.revokedDays} dias removidos.`,
	].join('\n')

	return {
		to: input.referrerEmail,
		subject: `Indicação revertida — -${input.revokedDays} dias no AGENDAI`,
		html: emailLayout({
			title,
			bodyHtml,
			ctaLabel: 'Ver minhas indicações',
			ctaUrl: frontendUrl('/app/referrals'),
		}),
		text,
		template: 'referral_revoked',
		metadata: {
			refereeShopName: input.refereeShopName,
			revokedDays: input.revokedDays,
		},
	}
}
