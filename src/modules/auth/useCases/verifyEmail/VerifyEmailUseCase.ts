import { prisma } from '@/libs/prismaClient'
import { rlsTransaction } from '@/libs/prismaExtensions'
import { AppError } from '@/shared/errors/AppError'

export class VerifyEmailUseCase {
	async execute(token: string): Promise<void> {
		if (!token?.trim()) {
			throw new AppError('Token inválido', 400)
		}

		const vt = await prisma.verificationToken.findUnique({
			where: { token: token.trim() },
		})
		if (!vt) throw new AppError('Token inválido', 400)
		if (vt.usedAt) throw new AppError('Token já utilizado', 400)
		if (vt.expiresAt < new Date()) throw new AppError('Token expirado', 400)

		await rlsTransaction(async (tx) => {
			await tx.user.update({
				where: { id: vt.userId },
				data: { emailVerified: true },
			})
			await tx.verificationToken.update({
				where: { id: vt.id },
				data: { usedAt: new Date() },
			})
		})
	}
}
