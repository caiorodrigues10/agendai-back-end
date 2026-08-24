import { FastifyRequest, FastifyReply } from 'fastify'
import { VerifyEmailUseCase } from '../useCases/verifyEmail/VerifyEmailUseCase'
import { emailLayout } from '@/modules/email/templates/emailLayout'

function frontendBase(): string {
	return (process.env.FRONTEND_URL || 'http://localhost:3002').replace(/\/$/, '')
}

export class VerifyEmailController {
	async handle(request: FastifyRequest, reply: FastifyReply) {
		const { token } = request.query as { token?: string }
		const useCase = new VerifyEmailUseCase()

		try {
			await useCase.execute(token ?? '')
			return reply.redirect(`${frontendBase()}/email-verificado`)
		} catch (err: unknown) {
			const message =
				err && typeof err === 'object' && 'message' in err
					? String((err as { message: string }).message)
					: 'Não foi possível verificar o e-mail'
			const failUrl = `${frontendBase()}/email-verificado?erro=${encodeURIComponent(message)}`
			return reply.redirect(failUrl)
		}
	}
}
