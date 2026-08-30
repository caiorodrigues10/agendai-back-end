import { randomBytes } from 'crypto'
import { prisma } from '@/libs/prismaClient'
import {
	REFERRAL_CODE_LENGTH,
	REFERRAL_REWARD_DAYS,
	REFERRAL_TIERS,
	getConversionsToNextTier,
	getNextTier,
	getReferralTier,
	type ReferralTierName,
} from '@/shared/constants/referral'
import { enqueueEmail } from '@/shared/infra/queue'
import { invalidateSubscriptionCache } from '@/shared/infra/http/middlewares/subscriptionAccessCache'
import { validateEmail } from '@/shared/services/emailValidationService'
import { normalizeCpf } from '@/shared/utils/cpfUtils'
import { sendWhatsAppMessage } from '@/shared/services/whatsappNotificationService'
import { getModuleLogger } from '@/shared/utils/logger'
import { getFrontendUrl } from '@/shared/constants/env'
import { AppError } from '@/shared/errors/AppError'

const logger = getModuleLogger('referrals');

function generateCode(length = REFERRAL_CODE_LENGTH): string {
	const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
	const bytes = randomBytes(length)
	let out = ''
	for (let i = 0; i < length; i++) {
		out += alphabet[bytes[i] % alphabet.length]
	}
	return out
}

function tierLabel(tier: ReferralTierName): string {
	if (tier === 'SILVER') return 'Prata'
	if (tier === 'GOLD') return 'Ouro'
	return 'Bronze'
}

export async function ensureReferralCode(input: {
	ownerUserId: string
	barbershopId: string
}) {
	const existing = await prisma.referralCode.findFirst({
		where: { barbershopId: input.barbershopId, active: true },
	})
	if (existing) return existing

	for (let attempt = 0; attempt < 5; attempt++) {
		const code = generateCode()
		try {
			return await prisma.referralCode.create({
				data: {
					code,
					ownerUserId: input.ownerUserId,
					barbershopId: input.barbershopId,
				},
			})
		} catch {
			/* unique collision — retry */
		}
	}
	throw new Error('Não foi possível gerar código de indicação')
}

/**
 * Atribui indicação no cadastro. Código inválido/inativo é ignorado (não falha register).
 */
export async function attachReferralOnRegister(input: {
	referralCode?: string
	refereeUserId: string
	refereeBarbershopId: string
	refereeOwnerName: string
	refereeEmail: string
	refereeCpf?: string
}): Promise<void> {
	const raw = input.referralCode?.trim().toUpperCase()
	if (!raw) return

	const emailVal = await validateEmail(input.refereeEmail)
	if (!emailVal.valid) return

	const code = await prisma.referralCode.findUnique({
		where: { code: raw },
		include: { barbershop: { select: { id: true, name: true } } },
	})
	if (!code || !code.active) return

	// Self-referral
	if (code.barbershopId === input.refereeBarbershopId) return
	if (code.ownerUserId === input.refereeUserId) return

	if (input.refereeCpf) {
		const referrerUser = await prisma.user.findUnique({
			where: { id: code.ownerUserId },
			select: { cpf: true },
		})
		if (referrerUser?.cpf) {
			const normalizedRefereeCpf = normalizeCpf(input.refereeCpf)
			const normalizedReferrerCpf = normalizeCpf(referrerUser.cpf)
			if (normalizedReferrerCpf === normalizedRefereeCpf) return
		}
	}

	if (code.maxUses != null) {
		const used = await prisma.referral.count({
			where: {
				referralCodeId: code.id,
				status: { in: ['PENDING', 'QUALIFIED', 'REWARDED'] },
			},
		})
		if (used >= code.maxUses) return
	}

	const already = await prisma.referral.findUnique({
		where: { refereeBarbershopId: input.refereeBarbershopId },
	})
	if (already) return

	await prisma.$transaction([
		prisma.barbershop.update({
			where: { id: input.refereeBarbershopId },
			data: { referredByCodeId: code.id },
		}),
		prisma.referral.create({
			data: {
				referralCodeId: code.id,
				referrerUserId: code.ownerUserId,
				referrerBarbershopId: code.barbershopId,
				refereeUserId: input.refereeUserId,
				refereeBarbershopId: input.refereeBarbershopId,
				refereeEmail: input.refereeEmail,
				status: 'PENDING',
				rewardDays: REFERRAL_REWARD_DAYS,
			},
		}),
	])

	await enqueueEmail({
		kind: 'referral_applied',
		ownerName: input.refereeOwnerName,
		email: input.refereeEmail,
		referrerShopName: code.barbershop.name,
		deduplicationKey: `referral-applied:${input.refereeBarbershopId}`,
	}).catch((err) => logger.error({ err }, 'Failed to send referral applied email'))
}

/** Allows an existing owner to attach a referral once, before their first payment. */
export async function applyReferralCode(input: {
	referralCode: string
	refereeUserId: string
	refereeBarbershopId: string
}): Promise<void> {
	const raw = input.referralCode.trim().toUpperCase()
	if (!raw) throw new AppError('Informe o código de indicação.', 400)

	const [referee, existing, code] = await Promise.all([
		prisma.user.findUnique({
			where: { id: input.refereeUserId },
			select: { name: true, email: true, cpf: true },
		}),
		prisma.referral.findUnique({ where: { refereeBarbershopId: input.refereeBarbershopId } }),
		prisma.referralCode.findUnique({ where: { code: raw } }),
	])

	if (!referee) throw new AppError('Usuário não encontrado.', 404)
	if (existing) throw new AppError('Este salão já possui uma indicação registrada.', 409)
	if (!code || !code.active) throw new AppError('Código de indicação inválido ou inativo.', 404)
	if (code.barbershopId === input.refereeBarbershopId || code.ownerUserId === input.refereeUserId) {
		throw new AppError('Você não pode usar o seu próprio código.', 400)
	}

	await attachReferralOnRegister({
		referralCode: raw,
		refereeUserId: input.refereeUserId,
		refereeBarbershopId: input.refereeBarbershopId,
		refereeOwnerName: referee.name,
		refereeEmail: referee.email,
		refereeCpf: referee.cpf ?? undefined,
	})

	const applied = await prisma.referral.findUnique({
		where: { refereeBarbershopId: input.refereeBarbershopId },
	})
	if (!applied) throw new AppError('Este código não pode ser aplicado à sua conta.', 400)
}

/**
 * Quando o indicado paga (assinatura ACTIVE), qualifica e recompensa o indicador.
 */
export async function qualifyReferralOnPayment(
	refereeBarbershopId: string,
): Promise<void> {
	const referral = await prisma.referral.findUnique({
		where: { refereeBarbershopId },
		include: {
			referrerUser: { select: { id: true, name: true, email: true } },
			referrerBarbershop: { select: { id: true, name: true, whatsapp: true } },
			refereeBarbershop: { select: { name: true } },
			referralCode: { select: { id: true, tier: true } },
		},
	})
	if (!referral) return
	if (referral.status === 'REWARDED' || referral.status === 'REJECTED') return

	const now = new Date()

	const convertedCount = await prisma.referral.count({
		where: {
			referrerBarbershopId: referral.referrerBarbershopId,
			status: 'REWARDED',
		},
	})

	const newTier = getReferralTier(convertedCount + 1)
	const tierConfig = REFERRAL_TIERS[newTier]
	const previousTier = referral.referralCode.tier as ReferralTierName

	let bonus = 0
	if (newTier !== previousTier && tierConfig.bonus > 0) {
		bonus = tierConfig.bonus
	}

	const totalDays = tierConfig.rewardDays + bonus

	const referrerSub = await prisma.subscription.findUnique({
		where: { barbershopId: referral.referrerBarbershopId },
	})

	await prisma.$transaction(async (tx: any) => {
		await tx.referral.update({
			where: { id: referral.id },
			data: {
				status: 'REWARDED',
				rewardDays: totalDays,
				qualifiedAt: referral.qualifiedAt ?? now,
				rewardedAt: now,
			},
		})

		await tx.referralCode.update({
			where: { id: referral.referralCodeId },
			data: { tier: newTier },
		})

		if (referrerSub) {
			const base =
				referrerSub.endDate && referrerSub.endDate > now
					? new Date(referrerSub.endDate)
					: now
			base.setDate(base.getDate() + totalDays)
			await tx.subscription.update({
				where: { id: referrerSub.id },
				data: {
					endDate: base,
					referralCreditDays: { increment: totalDays },
				},
			})
		}
	})

	if (referrerSub) {
		await invalidateSubscriptionCache(referral.referrerBarbershopId);

		await enqueueEmail({
			kind: 'referral_converted',
			referrerName: referral.referrerUser.name,
			referrerEmail: referral.referrerUser.email,
			refereeShopName: referral.refereeBarbershop.name,
			rewardDays: totalDays,
			deduplicationKey: `referral-converted:${referral.id}`,
		}).catch((err) => logger.error({ err }, 'Failed to send referral converted email'))

		const whatsapp = referral.referrerBarbershop.whatsapp
		if (whatsapp) {
			const msg = [
				`*Indicação convertida!*`,
				``,
				`O salão *${referral.refereeBarbershop.name}* assinou o AGENDAI.`,
				`+${totalDays} dias creditados na sua assinatura.`,
			].join('\n')
			await sendWhatsAppMessage(whatsapp, msg, { platform: true }).catch((err) => logger.error({ err }, 'Failed to send referral converted WhatsApp'))
		}
	} else {
		logger.warn({ referralId: referral.id, referrerBarbershopId: referral.referrerBarbershopId }, 'Referral marked REWARDED without referrer subscription')
	}
}

export async function revokeReferralOnCancellation(
	refereeBarbershopId: string,
): Promise<void> {
	const referral = await prisma.referral.findUnique({
		where: { refereeBarbershopId },
		include: {
			referrerUser: { select: { id: true, name: true, email: true } },
			refereeBarbershop: { select: { name: true } },
		},
	})
	if (!referral) return
	if (referral.status !== 'REWARDED') return

	const revokedDays = referral.rewardDays || REFERRAL_REWARD_DAYS
	const now = new Date()

	const referrerSub = await prisma.subscription.findUnique({
		where: { barbershopId: referral.referrerBarbershopId },
	})

	let daysActuallyRevoked = 0

	await prisma.$transaction(async (tx: any) => {
		await tx.referral.update({
			where: { id: referral.id },
			data: { status: 'REJECTED' },
		})

		if (referrerSub && referrerSub.referralCreditDays > 0) {
			daysActuallyRevoked = Math.min(revokedDays, referrerSub.referralCreditDays)

			let newEndDate: Date
			if (referrerSub.endDate && referrerSub.endDate > now) {
				newEndDate = new Date(referrerSub.endDate)
				newEndDate.setDate(newEndDate.getDate() - daysActuallyRevoked)
				if (newEndDate < now) newEndDate = now
			} else {
				newEndDate = now
			}

			await tx.subscription.update({
				where: { id: referrerSub.id },
				data: {
					endDate: newEndDate,
					referralCreditDays: Math.max(
						0,
						referrerSub.referralCreditDays - daysActuallyRevoked,
					),
				},
			})
		}

		// Recalcula tier do código após perda da conversão
		const remainingConverted = await tx.referral.count({
			where: {
				referrerBarbershopId: referral.referrerBarbershopId,
				status: 'REWARDED',
			},
		})
		await tx.referralCode.update({
			where: { id: referral.referralCodeId },
			data: { tier: getReferralTier(remainingConverted) },
		})
	})

	if (referrerSub) {
		await invalidateSubscriptionCache(referral.referrerBarbershopId);
	}

	const daysForNotify = daysActuallyRevoked || revokedDays

	await enqueueEmail({
		kind: 'referral_revoked',
		referrerName: referral.referrerUser.name,
		referrerEmail: referral.referrerUser.email,
		refereeShopName: referral.refereeBarbershop.name,
		revokedDays: daysForNotify,
		deduplicationKey: `referral-revoked:${referral.id}`,
	}).catch((err) => logger.error({ err }, 'Failed to send referral revoked email'))

	const referrerShop = await prisma.barbershop.findUnique({
		where: { id: referral.referrerBarbershopId },
		select: { whatsapp: true },
	})
	if (referrerShop?.whatsapp) {
		const msg = [
			`*Indicação revertida*`,
			``,
			`O salão *${referral.refereeBarbershop.name}* cancelou/estornou.`,
			`-${daysForNotify} dias removidos da sua assinatura.`,
		].join('\n')
		await sendWhatsAppMessage(referrerShop.whatsapp, msg, { platform: true }).catch((err) => logger.error({ err }, 'Failed to send referral revoked WhatsApp'))
	}

	await prisma.adminNotification
		.create({
			data: {
				type: 'REFERRAL_REVOKED',
				title: 'Indicação revertida',
				message: `Indicação do salão ${referral.refereeBarbershop.name} revertida (−${daysForNotify} dias).`,
				metadata: JSON.stringify({
					referralId: referral.id,
					refereeBarbershopId,
					referrerBarbershopId: referral.referrerBarbershopId,
					revokedDays: daysForNotify,
				}),
			},
		})
		.catch((err: unknown) => logger.error({ err }, 'Failed to create referral revoked admin notification'))
}

export async function getReferralDashboard(input: {
	ownerUserId: string
	barbershopId: string
}) {
	const code = await ensureReferralCode(input)
	const referrals = await prisma.referral.findMany({
		where: { referrerBarbershopId: input.barbershopId },
		include: {
			refereeBarbershop: { select: { id: true, name: true } },
		},
		orderBy: { createdAt: 'desc' },
		take: 100,
	})

	const pending = referrals.filter((r: { status: string }) => r.status === 'PENDING').length
	const converted = referrals.filter((r: { status: string }) => r.status === 'REWARDED').length
	const rejected = referrals.filter((r: { status: string }) => r.status === 'REJECTED').length
	const total = referrals.length

	const creditDays = await prisma.subscription.findUnique({
		where: { barbershopId: input.barbershopId },
		select: { referralCreditDays: true, endDate: true },
	})

	const currentTier = getReferralTier(converted)
	const tierConfig = REFERRAL_TIERS[currentTier]
	const nextTier = getNextTier(currentTier)
	const conversionsToNext = getConversionsToNextTier(converted)

	const frontend = getFrontendUrl()

	return {
		code: code.code,
		shareUrl: `${frontend}/login?ref=${code.code}`,
		rewardDays: tierConfig.rewardDays,
		tier: {
			name: currentTier,
			label: tierLabel(currentTier),
			rewardDays: tierConfig.rewardDays,
			bonus: tierConfig.bonus,
			threshold: tierConfig.threshold,
			nextTier,
			nextThreshold: nextTier ? REFERRAL_TIERS[nextTier].threshold : null,
		},
		convertedCount: converted,
		nextTierIn: conversionsToNext,
		stats: {
			pending,
			converted,
			rejected,
			total,
			creditDays: creditDays?.referralCreditDays ?? 0,
			subscriptionEndDate: creditDays?.endDate?.toISOString() ?? null,
		},
		referrals: referrals.map((r: { id: string; status: string; refereeBarbershop: { name: string }; rewardDays: number; createdAt: Date; qualifiedAt: Date | null; rewardedAt: Date | null }) => ({
			id: r.id,
			status: r.status,
			shopName: r.refereeBarbershop.name,
			rewardDays: r.rewardDays,
			createdAt: r.createdAt.toISOString(),
			qualifiedAt: r.qualifiedAt?.toISOString() ?? null,
			rewardedAt: r.rewardedAt?.toISOString() ?? null,
		})),
	}
}
