import { FastifyRequest, FastifyReply } from 'fastify'
import { container } from 'tsyringe'
import { SetupTrialCardUseCase } from './SetupTrialCardUseCase'
import { setupTrialCardSchema } from '../../schemas/subscriptionSchemas'
import { executeIdempotent } from '@/shared/services/idempotencyService'

export class SetupTrialCardController {
	async handle(request: FastifyRequest, reply: FastifyReply): Promise<void> {
		const body = setupTrialCardSchema.parse(request.body)
		const useCase = container.resolve(SetupTrialCardUseCase)

		const remoteIp =
			(request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
			request.ip

		const execution = await executeIdempotent(request, `trial-card:${request.user!.barbershopId ?? request.user!.id}`, () =>
			useCase.execute(
				{
					...body,
					remoteIp,
				},
				request.user!,
			),
		)

		return reply.send({
			success: true,
			message:
				'Trial iniciado. Informe o cartão no checkout hospedado Asaas — PAN não transita pelo AgendAI.',
			data: execution.data,
			replayed: execution.replayed,
		})
	}
}
