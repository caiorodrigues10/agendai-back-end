/**
 * Cálculo de períodos da exportação — no fuso do salão, iguais aos relatórios.
 *
 * Definições (documentadas na aba "Leia-me" de cada planilha):
 *   • **Hoje** — o dia inteiro no fuso do salão (`shopDayRange`).
 *   • **Esta semana** — domingo a sábado (mesma definição do app:
 *     `FinancialDashboard` usa `getDay()` com dom=0 e o bot do dono usa
 *     `startOf("week")` do dayjs, que começa no domingo).
 *   • **Este mês** — do dia 1 até hoje (não o mês inteiro: o relatório do
 *     app também "corta" em hoje).
 *   • **Últimos N meses** — janela móvel terminando hoje, começando no mesmo
 *     dia do mês (ou do ano) anterior; meses curtos são tratados pelo dayjs
 *     (31/01 − 2 meses → 30/11 ou 31/12 conforme o ano).
 *   • **Personalizado** — datas de calendário no fuso do salão, máx.
 *     `MAX_CUSTOM_PERIOD_MONTHS` meses por emissão.
 *   • **Tudo** — sem filtro de data (backup completo).
 */
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { AppError } from "@/shared/errors/AppError";
import { shopDayRange, shopMonthRange } from "@/modules/financial/ledger/shopTime";
import { MAX_CUSTOM_PERIOD_MONTHS, PERIOD_LABELS } from "../dataExport.constants";
import type { ExportPeriod, ExportPeriodPreset } from "../dataExport.types";

dayjs.extend(utc);
dayjs.extend(timezone);

export const EXPORT_PERIOD_PRESETS: ExportPeriodPreset[] = [
  "TODAY",
  "THIS_WEEK",
  "THIS_MONTH",
  "LAST_3_MONTHS",
  "LAST_6_MONTHS",
  "LAST_12_MONTHS",
  "CUSTOM",
  "ALL",
];

function formatBR(key: string): string {
  const [y, m, d] = key.split("-");
  return `${d}/${m}/${y}`;
}

/** Rótulo do período para a aba Resumo (inclui o intervalo real). */
function labelFor(preset: ExportPeriodPreset, fromKey: string, toKey: string): string {
  if (preset === "ALL") return "Tudo (backup completo)";
  return `${PERIOD_LABELS[preset]} (${formatBR(fromKey)} a ${formatBR(toKey)})`;
}

/**
 * Resolve o período pedido no fuso do salão.
 *
 * @param preset   preset escolhido pelo dono
 * @param timezone fuso do salão (`Barbershop.timezone`)
 * @param now      relógio (injetável para teste)
 * @param dateFrom yyyy-mm-dd (só para CUSTOM)
 * @param dateTo   yyyy-mm-dd (só para CUSTOM)
 */
export function resolveExportPeriod(
  preset: ExportPeriodPreset,
  timezone: string,
  now: Date = new Date(),
  dateFrom?: string,
  dateTo?: string,
): ExportPeriod {
  const today = dayjs(now).tz(timezone);
  const todayKey = today.format("YYYY-MM-DD");

  if (preset === "ALL") {
    return { preset, from: null, to: null, label: PERIOD_LABELS.ALL, timezone };
  }

  if (preset === "CUSTOM") {
    if (!dateFrom || !dateTo) {
      throw new AppError("Informe as datas inicial e final do período personalizado.", 400);
    }
    const from = dayjs.tz(`${dateFrom} 00:00:00`, timezone);
    const to = dayjs.tz(`${dateTo} 00:00:00`, timezone);
    if (!from.isValid() || !to.isValid()) {
      throw new AppError("Data inválida no período personalizado.", 400);
    }
    if (from.isAfter(to)) {
      throw new AppError("A data inicial não pode ser posterior à final.", 400);
    }
    if (to.isAfter(today.endOf("day"))) {
      throw new AppError("A data final não pode ser posterior a hoje.", 400);
    }
    if (from.add(MAX_CUSTOM_PERIOD_MONTHS + 1, "month").isBefore(to)) {
      throw new AppError(
        `O período personalizado é limitado a ${MAX_CUSTOM_PERIOD_MONTHS} meses por emissão.`,
        400,
      );
    }
    const { start } = shopDayRange(dateFrom, timezone);
    const { end } = shopDayRange(dateTo, timezone);
    return {
      preset,
      from: start,
      to: end,
      label: labelFor(preset, dateFrom, dateTo),
      timezone,
    };
  }

  // ── Presets que terminam hoje ──────────────────────────────────────────────
  let fromKey: string;
  let toKey = todayKey;

  switch (preset) {
    case "TODAY": {
      fromKey = todayKey;
      break;
    }
    case "THIS_WEEK": {
      // Domingo a sábado: `startOf("week")` do dayjs começa no domingo.
      fromKey = today.startOf("week").format("YYYY-MM-DD");
      break;
    }
    case "THIS_MONTH": {
      fromKey = today.format("YYYY-MM-01");
      break;
    }
    case "LAST_3_MONTHS": {
      fromKey = today.subtract(3, "month").format("YYYY-MM-DD");
      break;
    }
    case "LAST_6_MONTHS": {
      fromKey = today.subtract(6, "month").format("YYYY-MM-DD");
      break;
    }
    case "LAST_12_MONTHS": {
      fromKey = today.subtract(12, "month").format("YYYY-MM-DD");
      break;
    }
    default: {
      throw new AppError("Período de exportação inválido.", 400);
    }
  }

  const { start } = shopDayRange(fromKey, timezone);
  const { end } = shopDayRange(toKey, timezone);
  return { preset, from: start, to: end, label: labelFor(preset, fromKey, toKey), timezone };
}

/**
 * Período anterior equivalente (para o comparativo do Resumo).
 * Sem correspondência para "Tudo".
 */
export function previousExportPeriod(period: ExportPeriod): ExportPeriod | null {
  if (period.preset === "ALL" || !period.from || !period.to) return null;
  const tz = period.timezone;
  const end = dayjs(period.from).tz(tz).subtract(1, "millisecond");
  const endKey = end.format("YYYY-MM-DD");

  let fromKey: string;
  switch (period.preset) {
    case "TODAY":
      fromKey = dayjs(period.from).tz(tz).subtract(1, "day").format("YYYY-MM-DD");
      break;
    case "THIS_WEEK":
      fromKey = dayjs(period.from).tz(tz).subtract(7, "day").format("YYYY-MM-DD");
      break;
    case "THIS_MONTH": {
      const start = dayjs(period.from).tz(tz);
      fromKey = start.subtract(1, "month").format("YYYY-MM-01");
      break;
    }
    case "LAST_3_MONTHS":
    case "LAST_6_MONTHS":
    case "LAST_12_MONTHS": {
      const months = period.preset === "LAST_3_MONTHS" ? 3 : period.preset === "LAST_6_MONTHS" ? 6 : 12;
      fromKey = dayjs(period.from).tz(tz).subtract(months, "month").format("YYYY-MM-DD");
      break;
    }
    default: {
      // CUSTOM: mesma duração imediatamente antes.
      const durationDays = dayjs(period.to).diff(dayjs(period.from), "day") + 1;
      fromKey = dayjs(period.from).tz(tz).subtract(durationDays, "day").format("YYYY-MM-DD");
      break;
    }
  }

  const { start } = shopDayRange(fromKey, tz);
  const { end: prevEnd } = shopDayRange(endKey, tz);
  return {
    preset: period.preset,
    from: start,
    to: prevEnd,
    label: `${PERIOD_LABELS[period.preset]} anterior (${formatBR(fromKey)} a ${formatBR(endKey)})`,
    timezone: tz,
  };
}

/** Limites { gte, lte } para consultas Prisma (null quando "Tudo"). */
export function periodRange(period: ExportPeriod): { gte?: Date; lte?: Date } {
  if (!period.from || !period.to) return {};
  return { gte: period.from, lte: period.to };
}

/** "Este mês" e "Tudo" precisam de shopMonthRange em alguns builders. */
export { shopMonthRange };
