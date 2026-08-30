import { FastifyReply, FastifyRequest } from 'fastify'
import { container } from 'tsyringe'
import { GetMyReferralsUseCase } from '../useCases/getMyReferrals/GetMyReferralsUseCase'
import { applyReferralCode } from '../services/referralService'
import { AppError } from '@/shared/errors/AppError'

export class ReferralsController {
	async me(request: FastifyRequest, reply: FastifyReply) {
		const useCase = container.resolve(GetMyReferralsUseCase)
		const data = await useCase.execute({
			userId: request.user!.id,
			barbershopId: request.user!.barbershopId,
		})
		return reply.send({ success: true, data })
	}

	async applyCode(request: FastifyRequest<{ Body: { code: string } }>, reply: FastifyReply) {
		if (!request.user!.barbershopId) {
			throw new AppError('Usuário sem barbearia vinculada', 400)
		}
		await applyReferralCode({
			referralCode: request.body.code,
			refereeUserId: request.user!.id,
			refereeBarbershopId: request.user!.barbershopId,
		})
		return reply.send({ success: true })
	}
}
