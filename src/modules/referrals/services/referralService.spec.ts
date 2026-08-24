import { describe, expect, it } from 'vitest'
import {
	REFERRAL_CODE_LENGTH,
	REFERRAL_REWARD_DAYS,
	REFERRAL_TIERS,
	getConversionsToNextTier,
	getNextTier,
	getReferralTier,
} from '@/shared/constants/referral'

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
})
