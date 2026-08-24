import { injectable } from 'tsyringe'
import { AppError } from '@/shared/errors/AppError'
import { getReferralDashboard } from '../../services/referralService'

@injectable()
export class GetMyReferralsUseCase {
	async execute(input: { userId: string; barbershopId?: string | null }) {
		if (!input.barbershopId) {
			throw new AppError('Usuário sem barbearia vinculada', 400)
		}
		return getReferralDashboard({
			ownerUserId: input.userId,
			barbershopId: input.barbershopId,
		})
	}
}
