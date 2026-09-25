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
			message: 'Trial iniciado. O cartão foi cadastrado nesta página e só será cobrado no fim do período.',
			data: execution.data,
			replayed: execution.replayed,
		})
	}
}
