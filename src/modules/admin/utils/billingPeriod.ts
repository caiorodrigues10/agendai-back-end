/**
 * Períodos e conversões de valores usados no faturamento da plataforma.
 * Hora de referência: America/Sao_Paulo (UTC-3 fixo).
 */
export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;
const SP_OFFSET_MS = -3 * HOUR_MS;

/** Início (UTC) do mês corrente em America/Sao_Paulo (UTC-3 fixo). */
export function spMonthStart(now: Date): Date {
  const sp = new Date(now.getTime() + SP_OFFSET_MS);
  return new Date(Date.UTC(sp.getUTCFullYear(), sp.getUTCMonth(), 1) - SP_OFFSET_MS);
}

export function spMonthStartOffset(now: Date, monthDelta: number): Date {
  const sp = new Date(now.getTime() + SP_OFFSET_MS);
  return new Date(
    Date.UTC(sp.getUTCFullYear(), sp.getUTCMonth() + monthDelta, 1) - SP_OFFSET_MS,
  );
}

export function spYearStart(now: Date): Date {
  const sp = new Date(now.getTime() + SP_OFFSET_MS);
  return new Date(Date.UTC(sp.getUTCFullYear(), 0, 1) - SP_OFFSET_MS);
}

export type SubscriptionWithPlan = {
  status: string;
  plan: { price: number; billingCycle: string };
};

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function monthlyValue(price: number, billingCycle: string): number {
  return billingCycle === "YEARLY" ? price / 12 : price;
}

export function sumMonthly(values: SubscriptionWithPlan[]): number {
  return round2(
    values.reduce(
      (total: number, sub: SubscriptionWithPlan) =>
        total + monthlyValue(sub.plan.price, sub.plan.billingCycle),
      0,
    ),
  );
}

export {};
