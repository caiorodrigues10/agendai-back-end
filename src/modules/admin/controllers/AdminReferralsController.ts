import { FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '@/libs/prismaClient'

export class AdminReferralsController {
	async getStats(_request: FastifyRequest, reply: FastifyReply) {
		const [totalReferrals, converted, rejected, pending] = await Promise.all([
			prisma.referral.count(),
			prisma.referral.count({ where: { status: 'REWARDED' } }),
			prisma.referral.count({ where: { status: 'REJECTED' } }),
			prisma.referral.count({ where: { status: 'PENDING' } }),
		])

		const conversionRate =
			totalReferrals > 0
				? Number(((converted / totalReferrals) * 100).toFixed(1))
				: 0

		const topReferrers = await prisma.referral.groupBy({
			by: ['referrerBarbershopId'],
			where: { status: 'REWARDED' },
			_count: { id: true },
			_sum: { rewardDays: true },
			orderBy: { _count: { id: 'desc' } },
			take: 10,
		})

		const barbershopIds = topReferrers.map((r: { referrerBarbershopId: string | null }) => r.referrerBarbershopId)
		const barbershops = await prisma.barbershop.findMany({
			where: { id: { in: barbershopIds } },
			select: { id: true, name: true },
		})
		const barbershopMap = new Map(barbershops.map((b: { id: string; name: string }) => [b.id, b.name]))

		const topReferrersFormatted = topReferrers.map((r: { referrerBarbershopId: string | null; _count: { id: number }; _sum: { rewardDays: number | null } }) => ({
			barbershopId: r.referrerBarbershopId,
			barbershopName: barbershopMap.get(r.referrerBarbershopId) ?? 'Desconhecido',
			totalReferrals: r._count.id,
			creditDays: r._sum.rewardDays ?? 0,
		}))

		const twelveMonthsAgo = new Date()
		twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)

		const monthlyReferrals = await prisma.referral.findMany({
			where: { createdAt: { gte: twelveMonthsAgo } },
			select: { createdAt: true },
			orderBy: { createdAt: 'asc' },
		})

		const monthlyMap = new Map<string, number>()
		for (const r of monthlyReferrals) {
			const key = `${r.createdAt.getFullYear()}-${String(r.createdAt.getMonth() + 1).padStart(2, '0')}`
			monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + 1)
		}
		const monthlyEvolution = Array.from(monthlyMap.entries()).map(
			([month, count]) => ({ month, count }),
		)

		const totalCreditDays =
			(
				await prisma.referral.aggregate({
					where: { status: 'REWARDED' },
					_sum: { rewardDays: true },
				})
			)._sum.rewardDays ?? 0

		return reply.send({
			success: true,
			data: {
				totalReferrals,
				converted,
				rejected,
				pending,
				conversionRate,
				totalCreditDays,
				topReferrers: topReferrersFormatted,
				monthlyEvolution,
			},
		})
	}
}
