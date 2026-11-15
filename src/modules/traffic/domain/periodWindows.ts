/**
 * Period windows and bucketing for the traffic report — pure date math in
 * the America/Sao_Paulo civil calendar (Brazil has no DST since 2019, the
 * offset is a fixed UTC-3, matching `startOfTodaySaoPaulo` in
 * getAdminOverview.ts).
 *
 * Every boundary here is a *civil day* string (YYYY-MM-DD) or an hour bucket
 * (0–23). Nothing in this module touches the database or Redis.
 */

export const SP_TIMEZONE = "America/Sao_Paulo";
/** São Paulo is UTC-3 year-round (DST abolished in 2019). */
const SP_UTC_OFFSET_HOURS = 3;

export const TRAFFIC_PERIODS = ["day", "week", "month", "3m", "6m", "year", "all"] as const;

export type TrafficPeriod = (typeof TRAFFIC_PERIODS)[number];

export type BucketGranularity = "hour" | "day" | "week" | "month" | "year";

export interface ReportBucket {
  /** Civil day (YYYY-MM-DD) or hour key (`YYYY-MM-DDTHH`) of the bucket start. */
  start: string;
  /** Inclusive civil-day end of the bucket (YYYY-MM-DD). */
  end: string;
  /** pt-BR display label. */
  label: string;
  /** True when the bucket is incomplete (in progress or clipped by window). */
  partial: boolean;
}

export interface PeriodWindow {
  key: TrafficPeriod;
  label: string;
  granularity: BucketGranularity;
  /** First civil day of the window (inclusive). */
  fromDay: string;
  /** Last civil day of the window (inclusive). */
  toDay: string;
  /** Previous comparison window (null for `all`). */
  prevFromDay: string | null;
  prevToDay: string | null;
  buckets: ReportBucket[];
}

/** pt-BR period labels (screen catalog for this module). */
export const TRAFFIC_PERIOD_LABELS: Record<TrafficPeriod, string> = {
  day: "Dia",
  week: "Semana",
  month: "Mês",
  "3m": "3 meses",
  "6m": "6 meses",
  year: "Último ano",
  all: "Anos",
};

const MONTH_LABELS_PT_BR = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

function spParts(date: Date): { year: number; month: number; day: number; hour: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const pick = (type: string): number =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  return {
    year: pick("year"),
    month: pick("month"),
    day: pick("day"),
    hour: pick("hour") % 24,
  };
}

/** Civil day (YYYY-MM-DD) of `date` in America/Sao_Paulo. */
export function spDayKey(date: Date): string {
  const { year, month, day } = spParts(date);
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Hour bucket (0–23) of `date` in America/Sao_Paulo. */
export function spHour(date: Date): number {
  return spParts(date).hour;
}

/** Parse a civil day string into its UTC-midnight Date (Prisma `@db.Date`). */
export function civilDayToDate(dayKey: string): Date {
  return new Date(`${dayKey}T00:00:00.000Z`);
}

/** UTC instant of 00:00 in São Paulo on the given civil day. */
export function civilDayStartInstant(dayKey: string): Date {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, SP_UTC_OFFSET_HOURS, 0, 0, 0));
}

/** Add days to a civil day string (UTC math — no timezone involved). */
export function addDays(dayKey: string, days: number): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** First day of the month containing `dayKey`. */
export function startOfMonth(dayKey: string): string {
  return `${dayKey.slice(0, 7)}-01`;
}

/** Add calendar months to a civil day string (clamping the day of month). */
export function addMonths(dayKey: string, months: number): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const daysInTargetMonth = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const clamped = Math.min(d, daysInTargetMonth);
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}-${String(clamped).padStart(2, "0")}`;
}

function daysInMonth(dayKey: string): number {
  const [y, m] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** ISO weekday (1 = Monday … 7 = Sunday) of a civil day. */
export function isoWeekday(dayKey: string): number {
  const [y, m, d] = dayKey.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return weekday === 0 ? 7 : weekday;
}

/** Monday (inclusive) of the ISO week containing `dayKey`. */
export function startOfWeek(dayKey: string): string {
  return addDays(dayKey, -(isoWeekday(dayKey) - 1));
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function dayBucket(dayKey: string, today: string, fromDay: string, toDay: string): ReportBucket {
  const [y, m, d] = dayKey.split("-").map(Number);
  return {
    start: dayKey,
    end: dayKey,
    label: `${pad2(d)}/${pad2(m)}`,
    partial: dayKey === today || dayKey < fromDay || dayKey > toDay,
  };
}

function hourBuckets(dayKey: string, today: string, now: Date): ReportBucket[] {
  const currentHour = dayKey === today ? spHour(now) : -1;
  return Array.from({ length: 24 }, (_, hour) => ({
    start: `${dayKey}T${pad2(hour)}`,
    end: dayKey,
    label: `${pad2(hour)}:00`,
    // Only the in-progress hour is partial; hours still to come today are
    // simply empty (no data yet), never flagged as incomplete.
    partial: hour === currentHour,
  }));
}

function weekBuckets(fromDay: string, toDay: string, today: string): ReportBucket[] {
  const buckets: ReportBucket[] = [];
  let cursor = startOfWeek(fromDay);
  while (cursor <= toDay) {
    const weekEnd = addDays(cursor, 6);
    const clippedStart = cursor < fromDay ? fromDay : cursor;
    const clippedEnd = weekEnd > toDay ? toDay : weekEnd;
    const containsToday = today >= clippedStart && today <= clippedEnd;
    const [, m, d] = clippedStart.split("-").map(Number);
    buckets.push({
      start: clippedStart,
      end: clippedEnd,
      label: `${pad2(d)}/${pad2(m)}`,
      // Partial when the week is still running or was clipped by the window
      // edges (first/last week of a rolling range).
      partial: containsToday || clippedStart !== cursor || clippedEnd !== weekEnd,
    });
    cursor = addDays(weekEnd, 1);
  }
  return buckets;
}

function monthBuckets(fromDay: string, toDay: string, today: string): ReportBucket[] {
  const buckets: ReportBucket[] = [];
  let cursor = startOfMonth(fromDay);
  while (cursor <= toDay) {
    const monthEnd = `${cursor.slice(0, 7)}-${pad2(daysInMonth(cursor))}`;
    const clippedEnd = monthEnd > toDay ? toDay : monthEnd;
    const containsToday = today >= cursor && today <= clippedEnd;
    const [y, m] = cursor.split("-").map(Number);
    buckets.push({
      start: cursor,
      end: clippedEnd,
      label: `${pad2(m)}/${y}`,
      partial: containsToday || cursor < fromDay || monthEnd > toDay,
    });
    cursor = addMonths(cursor, 1);
  }
  return buckets;
}

function yearBuckets(fromDay: string, toDay: string, today: string): ReportBucket[] {
  const buckets: ReportBucket[] = [];
  let year = Number(fromDay.slice(0, 4));
  const lastYear = Number(toDay.slice(0, 4));
  while (year <= lastYear) {
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;
    const clippedStart = yearStart < fromDay ? fromDay : yearStart;
    const clippedEnd = yearEnd > toDay ? toDay : yearEnd;
    buckets.push({
      start: clippedStart,
      end: clippedEnd,
      label: String(year),
      partial: (today >= clippedStart && today <= clippedEnd) || yearStart < fromDay || yearEnd > toDay,
    });
    year += 1;
  }
  return buckets;
}

function buildBuckets(
  granularity: BucketGranularity,
  fromDay: string,
  toDay: string,
  today: string,
  now: Date,
): ReportBucket[] {
  switch (granularity) {
    case "hour":
      return hourBuckets(fromDay, today, now);
    case "day": {
      const buckets: ReportBucket[] = [];
      let cursor = fromDay;
      while (cursor <= toDay) {
        buckets.push(dayBucket(cursor, today, fromDay, toDay));
        cursor = addDays(cursor, 1);
      }
      return buckets;
    }
    case "week":
      return weekBuckets(fromDay, toDay, today);
    case "month":
      return monthBuckets(fromDay, toDay, today);
    case "year":
      return yearBuckets(fromDay, toDay, today);
  }
}

export interface BuildWindowOptions {
  /** First civil day with recorded traffic (required for `all`). */
  firstRecordedDay?: string | null;
}

/**
 * Build the report window for a period at `now`.
 *
 * - `day`     → today, per hour (24 buckets), previous window = yesterday.
 * - `week`    → last 7 civil days, per day, previous = the 7 days before.
 * - `month`   → current calendar month up to today, per day, previous =
 *               previous calendar month up to the same day-of-month.
 * - `3m`/`6m` → rolling 3/6 months, per ISO week (Mon–Sun), previous =
 *               equal-length window right before.
 * - `year`    → last 12 months, per calendar month, previous = the 12 months
 *               before that.
 * - `all`     → from the first recorded day to today, per year, no previous.
 */
export function buildPeriodWindow(
  period: TrafficPeriod,
  now: Date,
  options: BuildWindowOptions = {},
): PeriodWindow {
  const today = spDayKey(now);
  const label = TRAFFIC_PERIOD_LABELS[period];

  switch (period) {
    case "day": {
      const fromDay = today;
      const prevFrom = addDays(today, -1);
      return {
        key: period,
        label,
        granularity: "hour",
        fromDay,
        toDay: today,
        prevFromDay: prevFrom,
        prevToDay: prevFrom,
        buckets: buildBuckets("hour", fromDay, today, today, now),
      };
    }
    case "week": {
      const fromDay = addDays(today, -6);
      const prevToDay = addDays(fromDay, -1);
      const prevFromDay = addDays(prevToDay, -6);
      return {
        key: period,
        label,
        granularity: "day",
        fromDay,
        toDay: today,
        prevFromDay,
        prevToDay,
        buckets: buildBuckets("day", fromDay, today, today, now),
      };
    }
    case "month": {
      const fromDay = startOfMonth(today);
      const dayOfMonth = Number(today.slice(8, 10));
      const prevMonthStart = startOfMonth(addDays(fromDay, -1));
      const prevMonthLength = daysInMonth(prevMonthStart);
      const prevToDay = addDays(prevMonthStart, Math.min(dayOfMonth, prevMonthLength) - 1);
      return {
        key: period,
        label,
        granularity: "day",
        fromDay,
        toDay: today,
        prevFromDay: prevMonthStart,
        prevToDay,
        buckets: buildBuckets("day", fromDay, today, today, now),
      };
    }
    case "3m":
    case "6m": {
      const months = period === "3m" ? 3 : 6;
      const fromDay = addMonths(today, -months);
      const prevToDay = addDays(fromDay, -1);
      const prevFromDay = addMonths(prevToDay, -months);
      return {
        key: period,
        label,
        granularity: "week",
        fromDay,
        toDay: today,
        prevFromDay,
        prevToDay,
        buckets: buildBuckets("week", fromDay, today, today, now),
      };
    }
    case "year": {
      const fromDay = addMonths(today, -12);
      const prevToDay = addDays(fromDay, -1);
      const prevFromDay = addMonths(prevToDay, -12);
      return {
        key: period,
        label,
        granularity: "month",
        fromDay,
        toDay: today,
        prevFromDay,
        prevToDay,
        buckets: buildBuckets("month", fromDay, today, today, now),
      };
    }
    case "all": {
      const fromDay = options.firstRecordedDay && options.firstRecordedDay <= today
        ? options.firstRecordedDay
        : today;
      return {
        key: period,
        label,
        granularity: "year",
        fromDay,
        toDay: today,
        prevFromDay: null,
        prevToDay: null,
        buckets: buildBuckets("year", fromDay, today, today, now),
      };
    }
  }
}

/** Bucket key (start) → array index map for aligning series rows. */
export function bucketIndexByStart(buckets: ReportBucket[]): Map<string, number> {
  return new Map(buckets.map((bucket, index) => [bucket.start, index]));
}

/** Assign a civil day (or hour key) to the bucket that contains it. */
export function bucketStartForDay(dayKey: string, buckets: ReportBucket[]): string | null {
  for (const bucket of buckets) {
    if (dayKey >= bucket.start && dayKey <= bucket.end) return bucket.start;
  }
  return null;
}

/** Assign an hour bucket key (`YYYY-MM-DDTHH`) to the matching bucket. */
export function bucketStartForHour(hourKey: string, buckets: ReportBucket[]): string | null {
  const dayKey = hourKey.slice(0, 10);
  const hour = Number(hourKey.slice(11, 13));
  for (const bucket of buckets) {
    if (dayKey < bucket.start || dayKey > bucket.end) continue;
    if (bucket.start.includes("T")) {
      const bucketHour = Number(bucket.start.slice(11, 13));
      if (hour === bucketHour) return bucket.start;
      continue;
    }
    return bucket.start;
  }
  return null;
}
