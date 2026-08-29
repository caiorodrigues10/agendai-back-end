import { Resend } from 'resend'
import { injectable } from 'tsyringe'
import { prisma } from '@/libs/prismaClient'
import { getModuleLogger } from '@/shared/utils/logger'
import type {
	IEmailProvider,
	SendEmailInput,
	SendEmailResult,
} from '../IEmailProvider'

const logger = getModuleLogger('email:resend');

@injectable()
export class ResendEmailProvider implements IEmailProvider {
	private client: Resend | null = null

	private getClient(): Resend | null {
		const key = process.env.RESEND_API_KEY?.trim()
		if (!key) return null
		if (!this.client) this.client = new Resend(key)
		return this.client
	}

	private fromAddress(): string {
		return (
			process.env.EMAIL_FROM?.trim() ||
			'AGENDAI <onboarding@resend.dev>'
		)
	}

	async send(input: SendEmailInput): Promise<SendEmailResult> {
		const delivery = await prisma.emailDelivery
			.create({
				data: {
					to: input.to,
					template: input.template,
					status: 'PENDING',
					subject: input.subject.slice(0, 200),
					metadata: input.metadata
						? JSON.stringify(input.metadata)
						: null,
				},
			})
			.catch(() => null)

const allowlist = process.env.EMAIL_ALLOWLIST?.trim()
		if (allowlist && process.env.NODE_ENV !== 'production') {
			const allowed = allowlist
				.split(',')
				.map((e) => e.trim().toLowerCase())
				.filter(Boolean)
			if (!allowed.includes(input.to.toLowerCase())) {
				const msg = `E-mail fora da allowlist de desenvolvimento: ${input.to}`
				logger.warn({ to: input.to }, msg)
				if (delivery) {
					await prisma.emailDelivery
						.update({
							where: { id: delivery.id },
						data: { status: 'SKIPPED', error: msg },
					})
					.catch((err: unknown) => logger.error({ err }, 'Failed to update email delivery status to SKIPPED'))
				}
				return { ok: true, skipped: true, error: msg }
			}
		}

const client = this.getClient()
		if (!client) {
		logger.warn({ to: input.to, template: input.template }, 'RESEND_API_KEY ausente — skip envio')
		logger.debug({ subject: input.subject }, 'Email subject')
			if (delivery) {
				await prisma.emailDelivery
					.update({
						where: { id: delivery.id },
						data: {
							status: 'SKIPPED',
							error: 'RESEND_API_KEY not configured',
						},
					})
					.catch((err: unknown) => logger.error({ err }, 'Failed to update email delivery status to SKIPPED'))
			}
			return { ok: true, skipped: true }
		}

		try {
			const { data, error } = await client.emails.send({
				from: this.fromAddress(),
				to: input.to,
				subject: input.subject,
				html: input.html,
				text: input.text,
				replyTo: process.env.EMAIL_REPLY_TO?.trim() || undefined,
			})

if (error) {
				const errMsg = error.message || 'Resend error'
				if (delivery) {
					await prisma.emailDelivery
						.update({
							where: { id: delivery.id },
						data: { status: 'FAILED', error: errMsg },
					})
					.catch((err: unknown) => logger.error({ err }, 'Failed to update email delivery status to FAILED'))
				}
				return { ok: false, error: errMsg }
			}

			if (delivery) {
				await prisma.emailDelivery
					.update({
						where: { id: delivery.id },
						data: {
							status: 'SENT',
							providerId: data?.id ?? null,
						},
					})
					.catch((err: unknown) => logger.error({ err }, 'Failed to update email delivery status to SENT'))
			}

			return { ok: true, providerId: data?.id }
		} catch (err) {
			const errMsg =
				err instanceof Error ? err.message : 'Unknown email error'
			if (delivery) {
				await prisma.emailDelivery
					.update({
						where: { id: delivery.id },
					data: { status: 'FAILED', error: errMsg },
				})
				.catch((err: unknown) => logger.error({ err }, 'Failed to update email delivery status to FAILED'))
			}
			return { ok: false, error: errMsg }
		}
	}
}
