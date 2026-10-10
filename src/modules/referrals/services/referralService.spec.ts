import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
	REFERRAL_CODE_LENGTH,
	REFERRAL_REWARD_DAYS,
	REFERRAL_TIERS,
	getConversionsToNextTier,
	getNextTier,
	getReferralTier,
} from '@/shared/constants/referral'
import {
	qualifyReferralOnPayment,
	revokeReferralOnCancellation,
} from './referralService'

const prismaMock = vi.hoisted(() => ({
	referral: {
		findUnique: vi.fn(),
		updateMany: vi.fn(),
		count: vi.fn(),
	},
	referralCode: {
		update: vi.fn(),
	},
	subscription: {
		findUnique: vi.fn(),
		update: vi.fn(),
	},
	referralCreditLedger: {
		create: vi.fn(),
	},
	barbershop: {
		findUnique: vi.fn(),
	},
	adminNotification: {
		create: vi.fn(),
	},
	$transaction: vi.fn(),
}))

const queueMock = vi.hoisted(() => ({
	enqueueEmail: vi.fn(),
}))

const subscriptionCacheMock = vi.hoisted(() => ({
	invalidateSubscriptionCache: vi.fn(),
}))

const whatsappMock = vi.hoisted(() => ({
	sendWhatsAppMessage: vi.fn(),
}))

vi.mock('@/libs/prismaClient', () => ({ prisma: prismaMock }))
vi.mock('@/shared/infra/queue', () => queueMock)
vi.mock('@/shared/infra/http/middlewares/subscriptionAccessCache', () => subscriptionCacheMock)
vi.mock('@/shared/services/whatsappNotificationService', () => whatsappMock)
vi.mock('@/shared/services/emailValidationService', () => ({ validateEmail: vi.fn() }))
vi.mock('@/shared/utils/cpfUtils', () => ({ normalizeCpf: vi.fn((value: string) => value) }))
vi.mock('@/shared/constants/env', () => ({ getFrontendUrl: () => 'https://app.test' }))
vi.mock('@/shared/utils/logger', () => ({
	getModuleLogger: () => ({
		error: vi.fn(),
		warn: vi.fn(),
	}),
}))

function buildReferral(overrides: Record<string, unknown> = {}) {
	return {
		id: 'referral-1',
		status: 'PENDING',
		referralCodeId: 'code-1',
		referrerBarbershopId: 'shop-referrer',
		qualifiedAt: null,
		rewardDays: null,
		referrerUser: { id: 'user-1', name: 'Caio', email: 'caio@example.com' },
		referrerBarbershop: { id: 'shop-referrer', name: 'Salao A', whatsapp: null },
		refereeBarbershop: { name: 'Salao B' },
		referralCode: { id: 'code-1', tier: 'BRONZE' },
		...overrides,
	}
}

beforeEach(() => {
	vi.clearAllMocks()
	prismaMock.referral.count.mockResolvedValue(0)
	prismaMock.referralCode.update.mockResolvedValue({})
	prismaMock.subscription.findUnique.mockResolvedValue({
		id: 'subscription-1',
		barbershopId: 'shop-referrer',
		endDate: new Date('2026-10-10T00:00:00.000Z'),
		referralCreditDays: 0,
	})
	prismaMock.subscription.update.mockResolvedValue({})
	prismaMock.referralCreditLedger.create.mockResolvedValue({})
	prismaMock.barbershop.findUnique.mockResolvedValue({ whatsapp: null })
	prismaMock.adminNotification.create.mockResolvedValue({})
	queueMock.enqueueEmail.mockResolvedValue(undefined)
	subscriptionCacheMock.invalidateSubscriptionCache.mockResolvedValue(undefined)
	whatsappMock.sendWhatsAppMessage.mockResolvedValue(undefined)
	prismaMock.$transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
		callback({
			referral: prismaMock.referral,
			referralCode: prismaMock.referralCode,
			subscription: prismaMock.subscription,
			referralCreditLedger: prismaMock.referralCreditLedger,
		})
	)
})

describe('referral constants', () => {
	it('recompensa padrão é 30 dias', () => {
		expect(REFERRAL_REWARD_DAYS).toBe(30)
	})

	it('código tem comprimento configurável positivo', () => {
		expect(REFERRAL_CODE_LENGTH).toBeGreaterThanOrEqual(6)
	})

	it('getReferralTier respeita thresholds', () => {
		expect(getReferralTier(0)).toBe('BRONZE')
		expect(getReferralTier(2)).toBe('BRONZE')
		expect(getReferralTier(3)).toBe('SILVER')
		expect(getReferralTier(5)).toBe('SILVER')
		expect(getReferralTier(6)).toBe('GOLD')
	})

	it('getNextTier sobe até GOLD', () => {
		expect(getNextTier('BRONZE')).toBe('SILVER')
		expect(getNextTier('SILVER')).toBe('GOLD')
		expect(getNextTier('GOLD')).toBeNull()
	})

	it('getConversionsToNextTier calcula restante', () => {
		expect(getConversionsToNextTier(0)).toBe(REFERRAL_TIERS.SILVER.threshold)
		expect(getConversionsToNextTier(2)).toBe(1)
		expect(getConversionsToNextTier(3)).toBe(
			REFERRAL_TIERS.GOLD.threshold - 3,
		)
		expect(getConversionsToNextTier(6)).toBeNull()
	})

	it('tiers têm rewardDays e bonus esperados', () => {
		expect(REFERRAL_TIERS.BRONZE).toMatchObject({ rewardDays: 30, bonus: 0 })
		expect(REFERRAL_TIERS.SILVER).toMatchObject({ rewardDays: 40, bonus: 60 })
		expect(REFERRAL_TIERS.GOLD).toMatchObject({ rewardDays: 50, bonus: 90 })
	})

	it('não credita dias quando a indicação já foi recompensada por outro evento', async () => {
		prismaMock.referral.findUnique.mockResolvedValue(buildReferral())
		prismaMock.referral.updateMany.mockResolvedValue({ count: 0 })

		await qualifyReferralOnPayment('shop-referee')

		expect(prismaMock.referral.updateMany).toHaveBeenCalledWith(expect.objectContaining({
			where: { id: 'referral-1', status: 'PENDING' },
		}))
		expect(prismaMock.subscription.update).not.toHaveBeenCalled()
		expect(queueMock.enqueueEmail).not.toHaveBeenCalled()
	})

	it('não marca como recompensada quando o indicador ainda não tem assinatura', async () => {
		prismaMock.referral.findUnique.mockResolvedValue(buildReferral())
		prismaMock.subscription.findUnique.mockResolvedValue(null)

		await qualifyReferralOnPayment('shop-referee')

		expect(prismaMock.referral.updateMany).not.toHaveBeenCalled()
		expect(prismaMock.subscription.update).not.toHaveBeenCalled()
	})

	it('registra ledger quando credita uma indicação convertida', async () => {
		prismaMock.referral.findUnique.mockResolvedValue(buildReferral())
		prismaMock.referral.updateMany.mockResolvedValue({ count: 1 })

		await qualifyReferralOnPayment('shop-referee')

		expect(prismaMock.subscription.update).toHaveBeenCalledWith(expect.objectContaining({
			where: { id: 'subscription-1' },
			data: expect.objectContaining({
				referralCreditDays: { increment: 30 },
			}),
		}))
		expect(prismaMock.referralCreditLedger.create).toHaveBeenCalledWith({
			data: expect.objectContaining({
				referralId: 'referral-1',
				referrerBarbershopId: 'shop-referrer',
				subscriptionId: 'subscription-1',
				type: 'CREDIT',
				days: 30,
				idempotencyKey: 'referral-credit:referral-1',
			}),
		})
	})

	it('não remove dias quando a reversão já foi processada', async () => {
		prismaMock.referral.findUnique.mockResolvedValue(buildReferral({
			status: 'REWARDED',
			rewardDays: 30,
			referrerUser: { id: 'user-1', name: 'Caio', email: 'caio@example.com' },
			refereeBarbershop: { name: 'Salao B' },
		}))
		prismaMock.referral.updateMany.mockResolvedValue({ count: 0 })
		prismaMock.subscription.findUnique.mockResolvedValue({
			id: 'subscription-1',
			endDate: new Date('2026-10-10T00:00:00.000Z'),
			referralCreditDays: 30,
		})

		await revokeReferralOnCancellation('shop-referee')

		expect(prismaMock.referral.updateMany).toHaveBeenCalledWith({
			where: { id: 'referral-1', status: 'REWARDED' },
			data: { status: 'REJECTED' },
		})
		expect(prismaMock.subscription.update).not.toHaveBeenCalled()
		expect(queueMock.enqueueEmail).not.toHaveBeenCalled()
	})
})
