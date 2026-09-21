/**
 * Helpers for product expiration date logic.
 *
 * All date comparisons use string "YYYY-MM-DD" to avoid timezone pitfalls.
 * "Today" is resolved via the barbershop's timezone (default America/Sao_Paulo).
 */

import { Prisma, type ProductType as ProductTypeEnum } from "@prisma/client";

export const EXPIRING_SOON_DAYS = 30;

type ProductType = "RETAIL" | "CONSUMABLE" | "BOTH";

/** Returns true when the product type supports expiration tracking. */
export function supportsExpiration(type: ProductType): boolean {
  return type === "CONSUMABLE" || type === "BOTH";
}

/**
 * Get today's date as "YYYY-MM-DD" in the given timezone.
 * Uses Intl.DateTimeFormat to avoid DST offset issues.
 */
export function ymdInTimeZone(date: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}

/** Get today's "YYYY-MM-DD" in the barbershop's timezone. */
export function getShopToday(
  barbershopTimezone?: string | null,
): string {
  return ymdInTimeZone(new Date(), barbershopTimezone ?? "America/Sao_Paulo");
}

export type ExpirationStatus = "expired" | "expiring" | null;

/**
 * Determine the expiration status of a product.
 *
 * - "expired": expirationDate < today (date only, no time component).
 * - "expiring": today <= expirationDate <= today + days.
 * - null: no status (e.g. no expiration date, product not eligible).
 *
 * "today" must be the "YYYY-MM-DD" in the barbershop's timezone.
 */
export function getExpirationStatus(
  expirationDate: Date | string | null | undefined,
  todayISO: string,
  days: number = EXPIRING_SOON_DAYS,
): ExpirationStatus {
  if (!expirationDate) return null;

  // Normalize to "YYYY-MM-DD" string.
  // For Date objects: use toISOString().slice(0,10) to get UTC date (no timezone conversion).
  // @db.Date stores dates as midnight UTC; Prisma returns Date objects at midnight UTC.
  // Converting via timezone would shift the date (e.g. 2026-10-01T00:00Z → 2026-09-30 in Sao Paulo).
  const expStr =
    typeof expirationDate === "string"
      ? expirationDate.slice(0, 10)
      : expirationDate.toISOString().slice(0, 10);

  if (!expStr || expStr.length < 10) return null;

  // Expired: expirationDate < today
  if (expStr < todayISO) return "expired";

  // Calculate the "expiring soon" upper bound: today + days
  const [ty, tm, td] = todayISO.split("-").map(Number);
  const upperDate = new Date(Date.UTC(ty, tm - 1, td + days));
  const upperStr = upperDate.toISOString().slice(0, 10);

  // Expiring: today <= expirationDate <= today + days
  if (expStr <= upperStr) return "expiring";

  return null;
}

/**
 * Build a Prisma where clause for filtering products by expiration status.
 *
 * Combines with existing AND clauses (not OR) so it doesn't override search.
 * Always includes `active: true`, `trackStock: true`, `stockQty > 0`,
 * and type supports expiration.
 */
export function expirationWhere(
  status: "expired" | "expiring",
  todayISO: string,
  days: number = EXPIRING_SOON_DAYS,
): Prisma.ProductWhereInput {
  const typeClause = { type: { in: ["CONSUMABLE", "BOTH"] as ProductTypeEnum[] } };
  const base: Prisma.ProductWhereInput = {
    active: true,
    trackStock: true,
    stockQty: { gt: 0 },
    ...typeClause,
    expirationDate: { not: null },
  };

  if (status === "expired") {
    return { ...base, expirationDate: { lt: new Date(todayISO) } };
  }

  // expiring: today <= expirationDate <= today + days
  const [ty, tm, td] = todayISO.split("-").map(Number);
  const upperDate = new Date(Date.UTC(ty, tm - 1, td + days));
  return {
    ...base,
    expirationDate: { gte: new Date(todayISO), lte: upperDate },
  };
}
