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

  const weekly = await prisma.schedule.findUnique({
    where: { barbershopId_dayOfWeek: { barbershopId, dayOfWeek: weekday } },
    select: { isOpen: true, openTime: true, closeTime: true },
  });

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
  });
}
