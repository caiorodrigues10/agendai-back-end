/**
 * Janelas móveis do relatório de tráfego do salão (fuso America/Sao_Paulo).
 *
 * Contrato (`frontend/docs/TRAFFIC_BEACON_BACKEND_CONTRACT.md`):
 *   - `day`   = hoje (24 buckets de hora);
 *   - `week`  = últimos 7 dias;
 *   - `month` = últimos 30 dias;
 *   - `3m`    = 90 dias;
 *   - `year`  = 365 dias.
 *
 * Diferença para o relatório master (`periodWindows.ts`): lá `month` é o mês
 * CALENDÁRIO corrente e `year` são 12 meses-calendário. Aqui as janelas são
 * estritamente móveis ( rolling ), como o contrato do salão exige — por isso
 * este módulo não reutiliza `buildPeriodWindow`.
 *
 * A comparação é sempre a janela imediatamente anterior, do mesmo tamanho.
 */

import {
  addDays,
  dayBucket,
  hourBuckets,
  monthBuckets,
  spDayKey,
  weekBuckets,
  type BucketGranularity,
  type ReportBucket,
} from "./periodWindows";

export const SALON_TRAFFIC_PERIODS = ["day", "week", "month", "3m", "year"] as const;

export type SalonTrafficPeriod = (typeof SALON_TRAFFIC_PERIODS)[number];

/** pt-BR — mesmos rótulos usados pela tela do dono. */
export const SALON_TRAFFIC_PERIOD_LABELS: Record<SalonTrafficPeriod, string> = {
  day: "Hoje",
  week: "Últimos 7 dias",
  month: "Últimos 30 dias",
  "3m": "3 meses",
  year: "1 ano",
};

export interface SalonPeriodWindow {
  key: SalonTrafficPeriod;
  label: string;
  granularity: BucketGranularity;
  /** Primeiro dia civil da janela (inclusivo). */
  fromDay: string;
  /** Último dia civil da janela (inclusivo). */
  toDay: string;
  /** Janela anterior de mesmo tamanho (para a variação). */
  prevFromDay: string;
  prevToDay: string;
  buckets: ReportBucket[];
}

/** Janelas móveis (dias inclusivos) — 30, 90 e 365 dias. */
const MONTH_WINDOW_DAYS = 30;
const QUARTER_WINDOW_DAYS = 90;
const YEAR_WINDOW_DAYS = 365;

function dayBucketsFor(fromDay: string, toDay: string, today: string): ReportBucket[] {
  const buckets: ReportBucket[] = [];
  let cursor = fromDay;
  while (cursor <= toDay) {
    buckets.push(dayBucket(cursor, today, fromDay, toDay));
    cursor = addDays(cursor, 1);
  }
  return buckets;
}

/**
 * Monta a janela móvel do período pedido em `now`.
 *
 * `partial` marca o bucket corrente (o dia/hora em andamento) e os buckets
 * recortados pelas bordas da janela.
 */
export function buildSalonPeriodWindow(
  period: SalonTrafficPeriod,
  now: Date,
): SalonPeriodWindow {
  const today = spDayKey(now);
  const label = SALON_TRAFFIC_PERIOD_LABELS[period];

  switch (period) {
    case "day": {
      const prevDay = addDays(today, -1);
      return {
        key: period,
        label,
        granularity: "hour",
        fromDay: today,
        toDay: today,
        prevFromDay: prevDay,
        prevToDay: prevDay,
        buckets: hourBuckets(today, today, now),
      };
    }
    case "week": {
      const fromDay = addDays(today, -6);
      const prevToDay = addDays(fromDay, -1);
      return {
        key: period,
        label,
        granularity: "day",
        fromDay,
        toDay: today,
        prevFromDay: addDays(prevToDay, -6),
        prevToDay,
        buckets: dayBucketsFor(fromDay, today, today),
      };
    }
    case "month": {
      const fromDay = addDays(today, -(MONTH_WINDOW_DAYS - 1));
      const prevToDay = addDays(fromDay, -1);
      return {
        key: period,
        label,
        granularity: "day",
        fromDay,
        toDay: today,
        prevFromDay: addDays(prevToDay, -(MONTH_WINDOW_DAYS - 1)),
        prevToDay,
        buckets: dayBucketsFor(fromDay, today, today),
      };
    }
    case "3m": {
      const fromDay = addDays(today, -(QUARTER_WINDOW_DAYS - 1));
      const prevToDay = addDays(fromDay, -1);
      return {
        key: period,
        label,
        granularity: "week",
        fromDay,
        toDay: today,
        prevFromDay: addDays(prevToDay, -(QUARTER_WINDOW_DAYS - 1)),
        prevToDay,
        buckets: weekBuckets(fromDay, today, today),
      };
    }
    case "year": {
      const fromDay = addDays(today, -(YEAR_WINDOW_DAYS - 1));
      const prevToDay = addDays(fromDay, -1);
      return {
        key: period,
        label,
        granularity: "month",
        fromDay,
        toDay: today,
        prevFromDay: addDays(prevToDay, -(YEAR_WINDOW_DAYS - 1)),
        prevToDay,
        buckets: monthBuckets(fromDay, today, today),
      };
    }
  }
}
