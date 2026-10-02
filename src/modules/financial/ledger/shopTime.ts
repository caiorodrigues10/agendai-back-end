import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { prisma } from "@/libs/prismaClient";

dayjs.extend(utc);
dayjs.extend(timezone);

export const DEFAULT_SHOP_TIMEZONE = "America/Sao_Paulo";

/** Fuso do salão; `Barbershop.timezone` sempre existe no schema, com este default. */
export async function getShopTimezone(barbershopId: string): Promise<string> {
  try {
    const shop = await prisma.barbershop.findUnique({
      where: { id: barbershopId },
      select: { timezone: true },
    });
    return shop?.timezone || DEFAULT_SHOP_TIMEZONE;
  } catch {
    return DEFAULT_SHOP_TIMEZONE;
  }
}

/**
 * Converte uma Date enviada pelo front na data de calendário que ela representa.
 * O front monta datas como `new Date(yyyy, mm, dd)` (meia-noite local), então os
 * getters locais preservam o dia intencionado mesmo quando o servidor não está
 * em America/Sao_Paulo.
 */
export function calendarDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Limites [start, end) de um dia de calendário no fuso do salão. */
export function shopDayRange(calendarDate: string, timezone: string): { start: Date; end: Date } {
  const start = dayjs.tz(`${calendarDate} 00:00:00`, timezone);
  return { start: start.toDate(), end: start.add(1, "day").subtract(1, "millisecond").toDate() };
}

/** Limites [start, end] de um mês (YYYY-MM) no fuso do salão. */
export function shopMonthRange(period: string, timezone: string): { start: Date; end: Date } {
  const start = dayjs.tz(`${period}-01 00:00:00`, timezone);
  return { start: start.toDate(), end: start.add(1, "month").subtract(1, "millisecond").toDate() };
}

/** Dia de calendário (YYYY-MM-DD) em que o instante cai no fuso do salão. */
export function shopDateKey(instant: Date, timezone: string): string {
  return dayjs(instant).tz(timezone).format("YYYY-MM-DD");
}

/** Mês (YYYY-MM) em que o instante cai no fuso do salão. */
export function shopMonthKey(instant: Date, timezone: string): string {
  return dayjs(instant).tz(timezone).format("YYYY-MM");
}

/** "Hoje" no fuso do salão. */
export function shopToday(timezone: string): string {
  return dayjs().tz(timezone).format("YYYY-MM-DD");
}
