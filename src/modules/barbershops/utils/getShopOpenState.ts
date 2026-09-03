import { prisma } from "@/libs/prismaClient";
import {
  computeShopOpenState,
  weekdayInTimeZone,
  ymdInTimeZone,
  type ShopOpenState,
} from "./shopOpenState";

export function utcDateFromYmd(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

export async function getShopOpenState(
  barbershopId: string,
  opts?: { dateYmd?: string; now?: Date; forDateOnly?: boolean }
): Promise<ShopOpenState> {
  const now = opts?.now ?? new Date();
  const shop = await prisma.barbershop.findUnique({
    where: { id: barbershopId },
    select: {
      timezone: true,
      manualStatus: true,
      manualStatusSetAt: true,
      openingMode: true,
      queueClosedAt: true,
    },
  });
  if (!shop) {
    return { open: false, reason: "SCHEDULE", queueClosed: false };
  }

  const timeZone = shop.timezone || "America/Sao_Paulo";
  const targetYmd = opts?.dateYmd ?? ymdInTimeZone(now, timeZone);
  const targetDate = utcDateFromYmd(targetYmd);
  const weekday = weekdayInTimeZone(targetDate, "UTC");

  const [weekly, exception] = await Promise.all([
    prisma.schedule.findUnique({
      where: { barbershopId_dayOfWeek: { barbershopId, dayOfWeek: weekday } },
      select: { isOpen: true, openTime: true, closeTime: true },
    }),
    prisma.scheduleException.findUnique({
      where: { barbershopId_date: { barbershopId, date: targetDate } },
      select: { isOpen: true, openTime: true, closeTime: true },
    }),
  ]);

  return computeShopOpenState({
    now,
    timeZone,
    dateYmd: targetYmd,
    forDateOnly: opts?.forDateOnly,
    manualStatus: shop.manualStatus,
    manualStatusSetAt: shop.manualStatusSetAt,
    openingMode: shop.openingMode,
    queueClosedAt: shop.queueClosedAt,
    weekly,
    exception,
  });
}

export async function listUpcomingExceptions(barbershopId: string, fromYmd: string, days = 90) {
  const from = utcDateFromYmd(fromYmd);
  const to = utcDateFromYmd(
    new Date(from.getTime() + days * 86_400_000).toISOString().slice(0, 10)
  );
  const rows = await prisma.scheduleException.findMany({
    where: { barbershopId, date: { gte: from, lt: to } },
    orderBy: { date: "asc" },
    select: { id: true, date: true, isOpen: true, reason: true },
  });
  return rows.map((row: { id: string; date: Date; isOpen: boolean; reason: string | null }) => ({
    id: row.id,
    date: row.date.toISOString().slice(0, 10),
    isOpen: row.isOpen,
    reason: row.reason,
  }));
}
