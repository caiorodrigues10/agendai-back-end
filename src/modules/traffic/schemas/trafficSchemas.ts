import { z } from "zod";
import { spDayKey, TRAFFIC_PERIODS } from "../domain/periodWindows";
import { TRAFFIC_AREAS } from "../domain/trafficAreas";

const CIVIL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CIVIL_MONTH_PATTERN = /^\d{4}-\d{2}$/;

function daysInCalendarMonth(year: number, month: number): number {
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month, 0);
  return date.getUTCDate();
}

function isValidCivilDate(value: string): boolean {
  const match = CIVIL_DATE_PATTERN.exec(value);
  if (!match) return false;

  const year = Number(match[0].slice(0, 4));
  const month = Number(match[0].slice(5, 7));
  const day = Number(match[0].slice(8, 10));
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  return day <= daysInCalendarMonth(year, month);
}

function isValidCivilMonth(value: string): boolean {
  const match = CIVIL_MONTH_PATTERN.exec(value);
  if (!match) return false;

  const year = Number(match[0].slice(0, 4));
  const month = Number(match[0].slice(5, 7));
  return year >= 1 && month >= 1 && month <= 12;
}

/**
 * Query schema for the master-admin traffic report. `.strict()` rejects
 * unknown keys so a typo can never silently widen the query.
 *
 * `date` anchors `period=day`; `month` anchors `period=month`. They are
 * mutually exclusive, must match their period and cannot select a future
 * civil day/month in São Paulo.
 */
export const trafficReportQuerySchema = z
  .object({
    period: z.enum(TRAFFIC_PERIODS).optional().default("week"),
    area: z.enum(["all", ...TRAFFIC_AREAS]).optional().default("all"),
    /** Optional signup role filter ("new users" by role). */
    userRole: z
      .enum(["MASTER_ADMIN", "OWNER", "EMPLOYEE", "CUSTOMER"])
      .optional(),
    /** Civil day in America/Sao_Paulo (YYYY-MM-DD), only with period=day. */
    date: z
      .string()
      .regex(CIVIL_DATE_PATTERN, "date deve estar no formato YYYY-MM-DD")
      .optional(),
    /** Calendar month in America/Sao_Paulo (YYYY-MM), only with period=month. */
    month: z
      .string()
      .regex(CIVIL_MONTH_PATTERN, "month deve estar no formato YYYY-MM")
      .optional(),
  })
  .strict()
  .superRefine((query, ctx) => {
    if (query.date !== undefined && query.month !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["date"],
        message: "date e month são mutuamente exclusivos",
      });
    }

    if (query.date !== undefined && query.period !== "day") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["date"],
        message: "date só pode ser usado com period=day",
      });
    }

    if (query.month !== undefined && query.period !== "month") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["month"],
        message: "month só pode ser usado com period=month",
      });
    }

    if (
      query.date !== undefined &&
      CIVIL_DATE_PATTERN.test(query.date) &&
      !isValidCivilDate(query.date)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["date"],
        message: "date deve ser uma data de calendário válida",
      });
    }

    if (
      query.month !== undefined &&
      CIVIL_MONTH_PATTERN.test(query.month) &&
      !isValidCivilMonth(query.month)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["month"],
        message: "month deve ser um mês de calendário válido",
      });
    }

    const today = spDayKey(new Date());
    if (
      query.date !== undefined &&
      isValidCivilDate(query.date) &&
      query.date > today
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["date"],
        message: "date não pode ser uma data futura",
      });
    }

    if (
      query.month !== undefined &&
      isValidCivilMonth(query.month) &&
      query.month > today.slice(0, 7)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["month"],
        message: "month não pode ser um mês futuro",
      });
    }
  });

export type TrafficReportQueryInput = z.infer<typeof trafficReportQuerySchema>;

/**
 * Beacon payload. Accepted as `text/plain` (no CORS preflight) and parsed
 * either as JSON or as `p=…&r=…` form pairs. Only two fields ever leave the
 * browser: the front route path and the document referrer — both are
 * reduced to a classification / host server-side and never persisted raw.
 */
export const trafficBeaconBodySchema = z.object({
  /** Front route path (may contain a `?token=` — dropped before storage). */
  p: z.string().max(2048).optional(),
  /** `document.referrer` hostname (legacy absolute URL also accepted). */
  r: z.string().max(2048).optional(),
});

export type TrafficBeaconBody = z.infer<typeof trafficBeaconBodySchema>;
