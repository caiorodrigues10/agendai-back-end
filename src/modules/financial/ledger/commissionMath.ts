/**
 * Cálculo único de comissão usado por fila e agenda.
 *
 * Comissão em reais = finalPrice * percentage / 100, arredondada em centavos.
 * `Math.round(finalPrice * percentage) / 100` equivale a arredondar o valor em
 * centavos (multiply por 100 e arredondar) sem erro de ponto flutuante extra:
 *   33.33 * 30 = 999.9  → round = 1000 → 10.00
 *   100   * 30 = 3000   → round = 3000 → 30.00
 *
 * Substitui as duas fórmulas divergentes que existiam:
 *   - QueueRepository:      Math.round(price * pct) / 100
 *   - CommissionRepository: Math.round(price * pct * 100) / 10000  (9.999 no exemplo acima)
 */
export function commissionAmount(finalPrice: number, percentage: number): number {
  const price = Number.isFinite(finalPrice) ? finalPrice : 0;
  const pct = Number.isFinite(percentage) ? percentage : 0;
  if (price <= 0 || pct <= 0) return 0;
  return Math.round(price * pct) / 100;
}

/** Soma das comissões de uma divisão, arredondada em centavos. */
export function totalCommissionAmount(
  finalPrice: number,
  splits: Array<{ percentage: number }>,
): number {
  const total = splits.reduce((sum, split) => sum + commissionAmount(finalPrice, split.percentage), 0);
  return Math.round(total * 100) / 100;
}
