import type { AddonSnapshot } from "./addonTypes";

/**
 * Duração total do atendimento = base + Σ (duração do adicional × quantidade).
 * Tempo 0 em adicional não altera a soma.
 */
export function totalDurationMinutes(
  baseMinutes: number,
  snapshots: readonly AddonSnapshot[]
): number {
  const addons = snapshots.reduce(
    (sum, snap) => sum + snap.durationMinutes * snap.quantity,
    0
  );
  return baseMinutes + addons;
}

/**
 * Total cobrado no agendamento = preço do serviço + Σ (unitPrice × quantity).
 * Trabalha em centavos inteiros — sem arredondamento de float no meio do cálculo.
 */
export function appointmentTotal(
  servicePriceCents: number,
  snapshots: readonly AddonSnapshot[]
): number {
  const addons = snapshots.reduce(
    (sum, snap) => sum + snap.unitPriceCents * snap.quantity,
    0
  );
  return servicePriceCents + addons;
}

/**
 * Base de comissão = preço do serviço + apenas linhas `commissionable`.
 * Adicional não comissionável entra no total cobrado, mas não na comissão.
 * Receita do adicional é atribuída ao serviço base (decisão #9); o relatório
 * por adicional lê `appointment_addons`.
 */
export function commissionBase(
  servicePriceCents: number,
  snapshots: readonly AddonSnapshot[]
): number {
  const commissionable = snapshots
    .filter((snap) => snap.commissionable)
    .reduce((sum, snap) => sum + snap.unitPriceCents * snap.quantity, 0);
  return servicePriceCents + commissionable;
}
