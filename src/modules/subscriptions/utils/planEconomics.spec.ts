import { describe, it, expect } from "vitest";
import {
  computePlanEconomics,
  computePlatformEconomics,
} from "./planEconomics";

const plans = [
  { id: "m", name: "Mensal", price: 20, billingCycle: "MONTHLY" as const, tierKey: "pro" },
  { id: "a", name: "Anual", price: 200, billingCycle: "YEARLY" as const, tierKey: "pro" },
];

const dualTier = [
  { id: "e-m", name: "Essencial", price: 14, billingCycle: "MONTHLY" as const, tierKey: "essential" },
  { id: "e-a", name: "Essencial Anual", price: 140, billingCycle: "YEARLY" as const, tierKey: "essential" },
  { id: "p-m", name: "Pro", price: 20, billingCycle: "MONTHLY" as const, tierKey: "pro" },
  { id: "p-a", name: "Pro Anual", price: 200, billingCycle: "YEARLY" as const, tierKey: "pro" },
];

describe("planEconomics", () => {
  it("calcula economia anual de R$ 40", () => {
    const eco = computePlanEconomics({ plans });
    expect(eco.yearlySavingsPerYear).toBe(40);
  });

  it("emparelha economia pelo mesmo tier", () => {
    const eco = computePlanEconomics({
      plans: dualTier,
      currentPlanId: "p-m",
    });
    expect(eco.yearlySavingsPerYear).toBe(40); // 20*12 - 200
    expect(eco.monthlyPlan?.id).toBe("p-m");
    expect(eco.yearlyPlan?.id).toBe("p-a");
  });

  it("essencial: 2 meses grátis = R$ 28/ano", () => {
    const eco = computePlanEconomics({
      plans: dualTier,
      currentPlanId: "e-m",
    });
    expect(eco.yearlySavingsPerYear).toBe(28); // 14*12 - 140
  });

  it("acumula economia no plano anual", () => {
    const start = new Date();
    start.setMonth(start.getMonth() - 6);
    const eco = computePlanEconomics({
      plans,
      currentPlanId: "a",
      subscriptionStart: start,
    });
    expect(eco.currentBillingCycle).toBe("YEARLY");
    expect(eco.savedSoFar).toBeGreaterThan(15);
    expect(eco.savedSoFar).toBeLessThan(25);
    expect(eco.platformForegoneRevenueSoFar).toBe(eco.savedSoFar);
    expect(eco.missedSavingsSoFar).toBe(0);
  });

  it("mostra economia perdida no mensal", () => {
    const start = new Date();
    start.setMonth(start.getMonth() - 12);
    const eco = computePlanEconomics({
      plans,
      currentPlanId: "m",
      subscriptionStart: start,
    });
    expect(eco.missedSavingsPerYear).toBe(40);
    expect(eco.missedSavingsSoFar).toBeGreaterThan(35);
    expect(eco.savedSoFar).toBe(0);
  });

  it("agrega métricas da plataforma", () => {
    const start = new Date();
    start.setMonth(start.getMonth() - 12);
    const platform = computePlatformEconomics({
      plans,
      subscriptions: [
        { planId: "a", status: "ACTIVE", startDate: start },
        { planId: "m", status: "ACTIVE", startDate: start },
        { planId: "a", status: "CANCELED", startDate: start },
      ],
    });
    expect(platform.activeYearlySubscriptions).toBe(1);
    expect(platform.activeMonthlySubscriptions).toBe(1);
    expect(platform.projectedAnnualDiscount).toBe(40);
    expect(platform.totalTenantSavingsSoFar).toBeGreaterThan(35);
  });
});
