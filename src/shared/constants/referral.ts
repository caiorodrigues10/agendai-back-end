export const REFERRAL_REWARD_DAYS = 30
export const REFERRAL_CODE_LENGTH = 8

export type ReferralTierName = 'BRONZE' | 'SILVER' | 'GOLD'

export interface ReferralTierConfig {
	rewardDays: number
	bonus: number
	threshold: number
}

export const REFERRAL_TIERS: Record<ReferralTierName, ReferralTierConfig> = {
	BRONZE: { rewardDays: 30, bonus: 0, threshold: 0 },
	SILVER: { rewardDays: 40, bonus: 60, threshold: 3 },
	GOLD: { rewardDays: 50, bonus: 90, threshold: 6 },
}

export const TIER_ORDER: ReferralTierName[] = ['BRONZE', 'SILVER', 'GOLD']

export function getReferralTier(convertedCount: number): ReferralTierName {
	if (convertedCount >= REFERRAL_TIERS.GOLD.threshold) return 'GOLD'
	if (convertedCount >= REFERRAL_TIERS.SILVER.threshold) return 'SILVER'
	return 'BRONZE'
}

export function getNextTier(current: ReferralTierName): ReferralTierName | null {
	const idx = TIER_ORDER.indexOf(current)
	return idx < TIER_ORDER.length - 1 ? TIER_ORDER[idx + 1] : null
}

export function getConversionsToNextTier(convertedCount: number): number | null {
	const next = getNextTier(getReferralTier(convertedCount))
	if (!next) return null
	return REFERRAL_TIERS[next].threshold - convertedCount
}
