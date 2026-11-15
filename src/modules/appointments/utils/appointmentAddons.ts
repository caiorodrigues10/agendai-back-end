import {
  appointmentTotal,
  toCents,
  toReais,
  totalDurationMinutes,
  type AddonSnapshot,
} from "@/modules/addons";

/**
 * Linha de `appointment_addons` como lida do banco (Prisma). Usada por
 * conflito, slots, dashboard, digest, export e respostas — sempre via
 * `totalDurationMinutes`/`appointmentTotal` do domínio (FASE 3).
 */
export type AppointmentAddonRow = {
  addonId: string;
  /** Nome persistido no snapshot (`appointment_addons.nameSnapshot`). */
  nameSnapshot?: string;
  /** Nome já mapeado na resposta da aplicação (`name`). */
  name?: string;
  unitPrice: unknown;
  quantity: number;
  durationMinutes: number;
  commissionable: boolean;
};

/**
 * Converte a linha persistida (ou a linha já mapeada na resposta) no snapshot
 * imutável do domínio, sempre em centavos. Aceita as duas formas para que
 * criação, remarcação, leitura e conclusão compartilhem a mesma conversão.
 */
export function addonRowToSnapshot(row: AppointmentAddonRow): AddonSnapshot {
  return {
    addonId: row.addonId,
    name: row.nameSnapshot ?? row.name ?? "",
    unitPriceCents: toCents(Number(row.unitPrice)),
    quantity: row.quantity,
    durationMinutes: row.durationMinutes,
    commissionable: row.commissionable,
  };
}

/**
 * Duração de ocupação de um agendamento = `totalDurationMinutes(base, snaps)`.
 * `base` é `service.avgTimeMinutes` com o fallback 30 da convenção atual.
 */
export function appointmentDurationMinutes(
  baseMinutes: number,
  rows: readonly AppointmentAddonRow[] | null | undefined
): number {
  return totalDurationMinutes(
    baseMinutes,
    rows?.map(addonRowToSnapshot) ?? []
  );
}

type AddonResponseBody = {
  addons?: Array<{
    addonId: string;
    name: string;
    unitPrice: number;
    quantity: number;
    durationMinutes: number;
    commissionable: boolean;
  }>;
  totalPrice?: number;
  totalDurationMinutes?: number;
};

/**
 * Campos ADITIVOS de resposta (item 7 da FASE 3): sem adicional devolve `{}`
 * — a resposta JSON fica idêntica à de hoje; com adicional anexa `addons`
 * (snapshot em reais), `totalPrice` e `totalDurationMinutes`.
 */
export function addonResponseFields(
  service:
    | { price: number | null; avgTimeMinutes?: number | null }
    | null
    | undefined,
  rows: readonly AppointmentAddonRow[] | null | undefined
): AddonResponseBody {
  if (!rows || rows.length === 0) return {};
  const snapshots = rows.map(addonRowToSnapshot);
  const basePriceCents = toCents(Number(service?.price ?? 0));
  const baseDuration = service?.avgTimeMinutes ?? 30;
  return {
    addons: rows.map((row) => ({
      addonId: row.addonId,
      name: row.nameSnapshot ?? row.name ?? "",
      unitPrice: toReais(toCents(Number(row.unitPrice))),
      quantity: row.quantity,
      durationMinutes: row.durationMinutes,
      commissionable: row.commissionable,
    })),
    totalPrice: toReais(appointmentTotal(basePriceCents, snapshots)),
    totalDurationMinutes: totalDurationMinutes(baseDuration, snapshots),
  };
}
