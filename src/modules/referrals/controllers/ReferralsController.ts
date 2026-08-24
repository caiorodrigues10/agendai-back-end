import { FastifyReply, FastifyRequest } from 'fastify'
import { container } from 'tsyringe'
import { GetMyReferralsUseCase } from '../useCases/getMyReferrals/GetMyReferralsUseCase'

export class ReferralsController {
	async me(request: FastifyRequest, reply: FastifyReply) {
		const useCase = container.resolve(GetMyReferralsUseCase)
		const data = await useCase.execute({
			userId: request.user!.id,
			barbershopId: request.user!.barbershopId,
		})
		return reply.send({ success: true, data })
	}
}
