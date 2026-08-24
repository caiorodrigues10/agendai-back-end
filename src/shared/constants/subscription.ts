/** Quantidade de dias de trial para uma nova barbearia. */
export const TRIAL_DAYS = 30;

export function billingPeriodDays(
  billingCycle: "MONTHLY" | "YEARLY" | undefined | null
): number {
  return billingCycle === "YEARLY" ? 365 : 30;
}
