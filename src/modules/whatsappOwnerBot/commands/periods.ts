import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { shopDayRange, shopMonthRange } from "@/modules/financial/ledger/shopTime";
import type { OwnerBotPeriod } from "./types";

dayjs.extend(utc);
dayjs.extend(timezone);

const MONTH_NAMES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

const MONTH_ALIASES: Record<string, number> = {
  jan: 0,
  janeiro: 0,
  fev: 1,
  fevereiro: 1,
  mar: 2,
  marco: 2,
  abril: 3,
  abr: 3,
  maio: 4,
  mai: 4,
  jun: 5,
  junho: 5,
  jul: 6,
  julho: 6,
  ago: 7,
  agosto: 7,
  set: 8,
  setembro: 8,
  out: 9,
  outubro: 9,
  nov: 10,
  novembro: 10,
  dez: 11,
  dezembro: 11,
};

export type OwnerBotPeriodPreset = "day" | "week" | "month" | "range";

/**
 * Períodos do dono em PT-BR.
 *
 * O texto chega normalizado (sem acentos, minúsculo). O período é sempre
 * calculado no fuso do salão — "hoje" é o dia do salão, não do servidor.
 */
export function resolveOwnerBotPeriod(
  text: string,
  timezone: string,
  now: Date = new Date(),
  preset?: OwnerBotPeriodPreset
): OwnerBotPeriod | undefined {
  const today = dayjs(now).tz(timezone);
  const currentMonthKey = today.format("YYYY-MM");

  const dayPeriod = (offset: number, label: string): OwnerBotPeriod => {
    const date = today.add(offset, "day");
    const key = date.format("YYYY-MM-DD");
    const range = shopDayRange(key, timezone);
    return { kind: "day", label, from: range.start, to: range.end };
  };

  const monthPeriod = (offset: number, label: string): OwnerBotPeriod => {
    const date = today.add(offset, "month");
    const monthKey = date.format("YYYY-MM");
    const range = shopMonthRange(monthKey, timezone);
    return { kind: "month", label, from: range.start, to: range.end, monthKey };
  };

  const weekPeriod = (offset: number, label: string): OwnerBotPeriod => {
    const start = today.startOf("week").add(offset, "week");
    const end = start.endOf("week");
    return { kind: "week", label, from: start.toDate(), to: end.toDate() };
  };

  if (preset === "day") return dayPeriod(0, "hoje");
  if (preset === "week") return weekPeriod(0, "esta semana");
  if (preset === "month") {
    const range = shopMonthRange(currentMonthKey, timezone);
    return {
      kind: "month",
      label: "este mês",
      from: range.start,
      to: range.end,
      monthKey: currentMonthKey,
    };
  }

  // Mês passado / mês anterior
  if (/(mes passado|mês passado|mes anterior|mes anterior|last month)/.test(text)) {
    return monthPeriod(-1, "mês passado");
  }
  // Semana passada
  if (/(semana passada|semana anterior|week passada|last week)/.test(text)) {
    return weekPeriod(-1, "semana passada");
  }
  // Amanhã
  if (/(amanha|amanhã|tomorrow)/.test(text)) {
    return dayPeriod(1, "amanhã");
  }
  // Anteontem
  if (/anteontem/.test(text)) {
    return dayPeriod(-2, "anteontem");
  }
  // Ontem
  if (/(ontem|day before)/.test(text)) {
    return dayPeriod(-1, "ontem");
  }
  // Hoje
  if (/(hoje|agora|now|day today)/.test(text)) {
    return dayPeriod(0, "hoje");
  }
  // Esta semana / nos ultimos 7 dias
  if (/(esta semana|semana|7 dias|ultimos 7|sete dias|last week|week)/.test(text)) {
    return weekPeriod(0, "esta semana");
  }
  // Este mês / esse mês / no mês
  if (/(este mes|esse mes|no mes|mês atual|mes atual|30 dias|ultimos 30|last month)/.test(text)) {
    const range = shopMonthRange(currentMonthKey, timezone);
    return {
      kind: "month",
      label: "este mês",
      from: range.start,
      to: range.end,
      monthKey: currentMonthKey,
    };
  }
  // Mês nomeado: "faturamento de outubro"
  const monthMatch = text.match(/\b(?:de |do |em )?([a-z]{3,9})\b/);
  if (monthMatch) {
    const alias = MONTH_ALIASES[monthMatch[1]];
    if (alias !== undefined) {
      let year = today.year();
      const date = dayjs(`${year}-${String(alias + 1).padStart(2, "0")}-01`);
      // "março" em dezembro refere-se a março do ano passado.
      if (date.isAfter(today, "month")) year -= 1;
      const monthKey = `${year}-${String(alias + 1).padStart(2, "0")}`;
      const range = shopMonthRange(monthKey, timezone);
      return {
        kind: "month",
        label: `${MONTH_NAMES[alias]}/${year}`,
        from: range.start,
        to: range.end,
        monthKey,
      };
    }
  }
  // Últimos 90 dias / 3 meses
  if (/(90 dias|ultimos 90|3 meses|ultimos 3 meses)/.test(text)) {
    const from = today.subtract(89, "day").startOf("day");
    const to = today.endOf("day");
    return { kind: "range", label: "últimos 90 dias", from: from.toDate(), to: to.toDate() };
  }
  // Últimos 30 dias (quando não caiu no "este mês")
  if (/(ultimos 30|30 dias)/.test(text)) {
    const from = today.subtract(29, "day").startOf("day");
    const to = today.endOf("day");
    return { kind: "range", label: "últimos 30 dias", from: from.toDate(), to: to.toDate() };
  }

  return undefined;
}

/** Período do dia (usado nos comandos do dia). */
export function ownerBotToday(timezone: string, now: Date = new Date()): string {
  return dayjs(now).tz(timezone).format("YYYY-MM-DD");
}

/** Rótulo do período para a resposta. */
export function ownerBotPeriodLabel(period: OwnerBotPeriod): string {
  return period.label;
}
