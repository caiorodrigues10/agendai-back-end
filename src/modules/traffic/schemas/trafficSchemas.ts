import { z } from "zod";
import { spDayKey, TRAFFIC_PERIODS } from "../domain/periodWindows";
import { TRAFFIC_AREAS } from "../domain/trafficAreas";
import {
  SALON_IDENTIFIER_MAX_LENGTH,
  SALON_TRAFFIC_IDENTIFIER_TYPES,
  SALON_TRAFFIC_KINDS,
  SALON_TRAFFIC_ROUTES,
  matchesSalonIdentifierType,
  sanitizeSalonTrafficTab,
  type SalonTrafficIdentifierType,
} from "../domain/salonTraffic";
import { SALON_TRAFFIC_PERIODS } from "../domain/salonPeriodWindows";

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

/** Charset do identificador público do salão (contrato). */
const SALON_IDENTIFIER_PATTERN = /^[A-Za-z0-9-]+$/;

/** Padrões de rota que exigem atribuição de salão. */
const SALON_ONLY_ROUTES = ["/queue/:id", "/queue/:id/produtos/:productId"] as const;

/**
 * Beacon payload. Accepted as `text/plain` (no CORS preflight) and parsed
 * either as JSON or as `p=…&r=…` form pairs.
 *
 * Two payload paths share the endpoint:
 *   - global (marketing/intention): `{p, r?}` — only two fields ever leave the
 *     browser: the front route path and the document referrer — both are
 *     reduced to a classification / host server-side and never persisted raw;
 *   - salon (public salon pages): `{p, salon, salonType, kind, tab?, r?}`.
 *
 * The object is NOT strict: unknown fields are stripped by zod (never
 * persisted, never a 4xx). A malformed payload is discarded silently — the
 * endpoint always answers 204.
 */
export const trafficBeaconBodySchema = z
  .object({
    /** Front route path (may contain a `?token=` — dropped before storage). */
    p: z.string().max(2048).optional(),
    /** `document.referrer` hostname (legacy absolute URL also accepted). */
    r: z.string().max(2048).optional(),
    /** Public salon id (UUID) or slug — format validated before any lookup. */
    salon: z
      .string()
      .min(1)
      .max(SALON_IDENTIFIER_MAX_LENGTH)
      .regex(SALON_IDENTIFIER_PATTERN)
      .optional(),
    /** Shape of `salon` — must match the shape of the value itself. */
    salonType: z.enum(SALON_TRAFFIC_IDENTIFIER_TYPES).optional(),
    /** Event kind — required for salon pings (visit = page load, tab = switch). */
    kind: z.enum(SALON_TRAFFIC_KINDS).optional(),
    /** Visible tab — a value outside the allowlist becomes absent. */
    tab: z.unknown().transform(sanitizeSalonTrafficTab),
  })
  .superRefine((body, ctx) => {
    const hasSalonSignal =
      body.salon !== undefined ||
      body.salonType !== undefined ||
      body.kind !== undefined ||
      body.tab !== undefined;
    const isSalonRoute =
      body.p !== undefined &&
      (SALON_TRAFFIC_ROUTES as readonly string[]).includes(body.p);

    if (hasSalonSignal) {
      if (body.salon === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["salon"],
          message: "salon é obrigatório no ping de salão",
        });
      }
      if (body.salonType === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["salonType"],
          message: "salonType é obrigatório no ping de salão",
        });
      }
      if (body.kind === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["kind"],
          message: "kind é obrigatório no ping de salão",
        });
      }
      if (!isSalonRoute) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["p"],
          message: "rota de salão inválida",
        });
      }
      // `salonType` nunca é "adivinhado": a forma do valor tem de bater com o
      // tipo declarado, senão o ping inteiro é descartado.
      if (
        body.salon !== undefined &&
        body.salonType !== undefined &&
        !matchesSalonIdentifierType(
          body.salon,
          body.salonType as SalonTrafficIdentifierType,
        )
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["salon"],
          message: "salon não corresponde ao salonType declarado",
        });
      }
      return;
    }

    // `/queue/*` só existe como página pública de salão: sem atribuição o
    // ping é incoerente e é descartado. `/s/:slug` sem `salon` continua
    // valendo como ping anônimo (compatibilidade com o contrato).
    if (body.p !== undefined && (SALON_ONLY_ROUTES as readonly string[]).includes(body.p)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["p"],
        message: "rota de salão exige salon, salonType e kind",
      });
    }
  });

export type TrafficBeaconBody = z.infer<typeof trafficBeaconBodySchema>;

/**
 * Query do relatório do dono do salão.
 *
 * A query tem APENAS `period` (janelas móveis calculadas no servidor) —
 * qualquer outro parâmetro é rejeitado para não abrir uma brecha de filtro.
 */
export const salonTrafficQuerySchema = z
  .object({
    period: z.enum(SALON_TRAFFIC_PERIODS),
  })
  .strict();

export type SalonTrafficQueryInput = z.infer<typeof salonTrafficQuerySchema>;

/** true quando o payload carrega sinal de atribuição de salão. */
export function hasSalonAttribution(body: TrafficBeaconBody): boolean {
  return (
    body.salon !== undefined ||
    body.salonType !== undefined ||
    body.kind !== undefined ||
    body.tab !== undefined
  );
}
