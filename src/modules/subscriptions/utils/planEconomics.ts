export type PlanBillingCycle = "MONTHLY" | "YEARLY";

export interface PlanCycleInfo {
  id: string;
  name: string;
  price: number;
  billingCycle: PlanBillingCycle;
  tierKey: string;
}

export interface PlanEconomicsDTO {
  monthlyPlan: PlanCycleInfo | null;
  yearlyPlan: PlanCycleInfo | null;
  /** Economia de 1 ano no anual vs 12× mensal (mesmo tier) */
  yearlySavingsPerYear: number;
  /** Ciclo do plano atual (se houver assinatura) */
  currentBillingCycle: PlanBillingCycle | null;
  /** Meses desde o início da assinatura (aprox.) */
  monthsActive: number;
  /**
   * Economia já acumulada no anual (vs ter pago mensal no mesmo período).
   * 0 se não estiver no plano anual.
   */
  savedSoFar: number;
  /** Economia projetada em 12 meses no anual */
  projectedYearlySavings: number;
  /**
   * Quanto deixou de economizar por estar no mensal (acumulado no período).
   * 0 se estiver no anual ou sem plano mensal/anual de referência.
   */
  missedSavingsSoFar: number;
  /** Quanto deixa de economizar por ano permanecendo no mensal */
  missedSavingsPerYear: number;
  /**
   * Mesma métrica de desconto, vista como receita que a plataforma
   * deixou de cobrar no período (útil no Master Admin e transparência).
   */
  platformForegoneRevenueSoFar: number;
  platformForegoneRevenuePerYear: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function monthsBetween(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  if (ms <= 0) return 0;
  return ms / (1000 * 60 * 60 * 24 * 30.4375);
}

export function inferBillingCycle(
  plan: { billingCycle?: string | null; name?: string | null }
): PlanBillingCycle {
  if (plan.billingCycle === "YEARLY" || plan.billingCycle === "MONTHLY") {
    return plan.billingCycle;
  }
  const name = (plan.name ?? "").toLowerCase();
  if (name.includes("anual") || name.includes("ano") || name.includes("year")) {
    return "YEARLY";
  }
  return "MONTHLY";
}

function inferTierKey(plan: {
  tierKey?: string | null;
  name?: string | null;
  hasDashboard?: boolean | null;
}): string {
  if (plan.tierKey) return plan.tierKey;
  const name = (plan.name ?? "").toLowerCase();
  if (name.includes("essencial") || name.includes("essential") || name.includes("starter")) {
    return "essential";
  }
  if (plan.hasDashboard === false) return "essential";
  return "pro";
}

export function computePlanEconomics(params: {
  plans: Array<{
    id: string;
    name: string;
    price: number;
    billingCycle?: string | null;
    tierKey?: string | null;
    hasDashboard?: boolean | null;
  }>;
  currentPlanId?: string | null;
  subscriptionStart?: Date | null;
  now?: Date;
}): PlanEconomicsDTO {
  const now = params.now ?? new Date();
  const normalized: PlanCycleInfo[] = params.plans.map((p) => ({
    id: p.id,
    name: p.name,
    price: p.price,
    billingCycle: inferBillingCycle(p),
    tierKey: inferTierKey(p),
  }));

  const current = params.currentPlanId
    ? normalized.find((p) => p.id === params.currentPlanId) ?? null
    : null;

  // Emparelha mensal/anual do mesmo tier (essential vs pro)
  const tierKey =
    current?.tierKey ??
    normalized.find((p) => p.billingCycle === "MONTHLY")?.tierKey ??
    "pro";

  const siblings = normalized.filter((p) => p.tierKey === tierKey);
  const pool = siblings.length > 0 ? siblings : normalized;

  const monthlyPlan =
    pool.find((p) => p.billingCycle === "MONTHLY") ?? null;
  const yearlyPlan =
    pool.find((p) => p.billingCycle === "YEARLY") ?? null;

  const yearlySavingsPerYear =
    monthlyPlan && yearlyPlan
      ? Math.max(0, round2(monthlyPlan.price * 12 - yearlyPlan.price))
      : 0;

  const currentBillingCycle = current?.billingCycle ?? null;

  const monthsActive = params.subscriptionStart
    ? monthsBetween(params.subscriptionStart, now)
    : 0;

  const fractionOfYear = monthsActive / 12;
  const accruedDiscount = round2(fractionOfYear * yearlySavingsPerYear);

  const isOnYearly = currentBillingCycle === "YEARLY";
  const isOnMonthly = currentBillingCycle === "MONTHLY";

  const savedSoFar = isOnYearly ? accruedDiscount : 0;
  const missedSavingsSoFar = isOnMonthly ? accruedDiscount : 0;

  return {
    monthlyPlan,
    yearlyPlan,
    yearlySavingsPerYear,
    currentBillingCycle,
    monthsActive: round2(monthsActive),
    savedSoFar,
    projectedYearlySavings: isOnYearly ? yearlySavingsPerYear : 0,
    missedSavingsSoFar,
    missedSavingsPerYear: isOnMonthly ? yearlySavingsPerYear : 0,
    platformForegoneRevenueSoFar: isOnYearly ? accruedDiscount : 0,
    platformForegoneRevenuePerYear: isOnYearly ? yearlySavingsPerYear : 0,
  };
}

export function computePlatformEconomics(params: {
  plans: Array<{
    id: string;
    name: string;
    price: number;
    billingCycle?: string | null;
    tierKey?: string | null;
    hasDashboard?: boolean | null;
  }>;
  subscriptions: Array<{
    planId: string;
    status: string;
    startDate: Date;
  }>;
  now?: Date;
}): {
  yearlySavingsPerYear: number;
  activeYearlySubscriptions: number;
  activeMonthlySubscriptions: number;
  /** Soma da economia acumulada dos salões no anual */
  totalTenantSavingsSoFar: number;
  /** Receita que a plataforma deixou de cobrar (desconto anual acumulado) */
  totalPlatformForegoneSoFar: number;
  /** Projeção anual de desconto se todos os anuais atuais renovarem */
  projectedAnnualDiscount: number;
  monthlyPlanPrice: number | null;
  yearlyPlanPrice: number | null;
} {
  const now = params.now ?? new Date();
  const base = computePlanEconomics({ plans: params.plans, now });

  let totalTenantSavingsSoFar = 0;
  let activeYearly = 0;
  let activeMonthly = 0;
  let projectedAnnualDiscount = 0;

  for (const sub of params.subscriptions) {
    if (!["ACTIVE", "TRIALING"].includes(sub.status)) continue;
    const eco = computePlanEconomics({
      plans: params.plans,
      currentPlanId: sub.planId,
      subscriptionStart: sub.startDate,
      now,
    });
    if (eco.currentBillingCycle === "YEARLY") {
      activeYearly += 1;
      totalTenantSavingsSoFar += eco.savedSoFar;
      projectedAnnualDiscount += eco.yearlySavingsPerYear;
    } else if (eco.currentBillingCycle === "MONTHLY") {
      activeMonthly += 1;
    }
  }

  return {
    yearlySavingsPerYear: base.yearlySavingsPerYear,
    activeYearlySubscriptions: activeYearly,
    activeMonthlySubscriptions: activeMonthly,
    totalTenantSavingsSoFar: round2(totalTenantSavingsSoFar),
    totalPlatformForegoneSoFar: round2(totalTenantSavingsSoFar),
    projectedAnnualDiscount: round2(projectedAnnualDiscount),
    monthlyPlanPrice: base.monthlyPlan?.price ?? null,
    yearlyPlanPrice: base.yearlyPlan?.price ?? null,
  };
}
