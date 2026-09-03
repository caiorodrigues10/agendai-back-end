export type ManualShopStatus = "AUTO" | "OPEN" | "CLOSED";
export type OpeningMode = "SCHEDULE" | "MANUAL";

export type ShopOpenReason =
  | "MANUAL_OPEN"
  | "MANUAL_CLOSED"
  | "MANUAL_MODE_NOT_OPENED"
  | "EXCEPTION"
  | "SCHEDULE"
  | "OUTSIDE_HOURS";

export interface ShopOpenState {
  open: boolean;
  reason: ShopOpenReason;
  queueClosed: boolean;
}

export interface WeeklyHours {
  isOpen: boolean;
  openTime: string;
  closeTime: string;
}

export interface DayException {
  isOpen: boolean;
  openTime?: string | null;
  closeTime?: string | null;
}

export interface ComputeShopOpenStateInput {
  now: Date;
  timeZone: string;
  /** YYYY-MM-DD. Defaults to today in the shop timezone. */
  dateYmd?: string;
  /** When true, ignore clock hours (booking a calendar day). */
  forDateOnly?: boolean;
  manualStatus: ManualShopStatus;
  manualStatusSetAt: Date | null;
  openingMode: OpeningMode;
  queueClosedAt: Date | null;
  weekly?: WeeklyHours | null;
  exception?: DayException | null;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Calendar date (YYYY-MM-DD) in the given IANA timezone. */
export function ymdInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

/** 0 = Sunday … 6 = Saturday in the given timezone. */
export function weekdayInTimeZone(date: Date, timeZone: string): number {
  const wd = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(date);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
}

export function minutesInTimeZone(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  let hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  if (hour === 24) hour = 0;
  return hour * 60 + minute;
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function addDaysYmd(ymd: string, days: number): string {
  const [y, mo, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d + days));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

function effectiveManualStatus(input: ComputeShopOpenStateInput, todayYmd: string): ManualShopStatus {
  if (input.manualStatus !== "OPEN") return input.manualStatus;
  if (!input.manualStatusSetAt) return "AUTO";
  return ymdInTimeZone(input.manualStatusSetAt, input.timeZone) === todayYmd ? "OPEN" : "AUTO";
}

function hoursFrom(source: WeeklyHours | DayException | null | undefined): WeeklyHours | null {
  if (!source) return null;
  if (!source.isOpen) return { isOpen: false, openTime: "00:00", closeTime: "00:00" };
  const openTime = "openTime" in source ? source.openTime : undefined;
  const closeTime = "closeTime" in source ? source.closeTime : undefined;
  return {
    isOpen: true,
    openTime: openTime || "00:00",
    closeTime: closeTime || "23:59",
  };
}

/**
 * Decides if the shop is operating on a given calendar date (or right now).
 * Manual OPEN/CLOSED only apply to *today* in the shop timezone.
 * Future dates follow weekly hours + schedule exceptions.
 */
export function computeShopOpenState(input: ComputeShopOpenStateInput): ShopOpenState {
  const todayYmd = ymdInTimeZone(input.now, input.timeZone);
  const targetYmd = input.dateYmd ?? todayYmd;
  const isToday = targetYmd === todayYmd;
  const status = effectiveManualStatus(input, todayYmd);
  const queueClosed = Boolean(
    input.queueClosedAt && ymdInTimeZone(input.queueClosedAt, input.timeZone) === todayYmd
  );

  if (isToday && status === "CLOSED") {
    return { open: false, reason: "MANUAL_CLOSED", queueClosed };
  }
  if (isToday && status === "OPEN") {
    return { open: true, reason: "MANUAL_OPEN", queueClosed };
  }

  if (input.exception && !input.exception.isOpen) {
    return { open: false, reason: "EXCEPTION", queueClosed };
  }

  if (isToday && input.openingMode === "MANUAL") {
    return { open: false, reason: "MANUAL_MODE_NOT_OPENED", queueClosed };
  }

  const hours = hoursFrom(input.exception?.isOpen ? input.exception : input.weekly);
  if (!hours || !hours.isOpen) {
    return { open: false, reason: "SCHEDULE", queueClosed };
  }

  if (!input.forDateOnly && isToday) {
    const nowMin = minutesInTimeZone(input.now, input.timeZone);
    const openMin = timeToMinutes(hours.openTime);
    const closeMin = timeToMinutes(hours.closeTime);
    if (nowMin < openMin || nowMin >= closeMin) {
      return { open: false, reason: "OUTSIDE_HOURS", queueClosed };
    }
  }

  return { open: true, reason: "SCHEDULE", queueClosed };
}
