import { z } from "zod";
import { TRAFFIC_PERIODS } from "../domain/periodWindows";
import { TRAFFIC_AREAS } from "../domain/trafficAreas";

/**
 * Query schema for the master-admin traffic report. `.strict()` rejects
 * unknown keys so a typo can never silently widen the query.
 */
export const trafficReportQuerySchema = z
  .object({
    period: z.enum(TRAFFIC_PERIODS).optional().default("week"),
    area: z.enum(["all", ...TRAFFIC_AREAS]).optional().default("all"),
    /** Optional signup role filter ("new users" by role). */
    userRole: z
      .enum(["MASTER_ADMIN", "OWNER", "EMPLOYEE", "CUSTOMER"])
      .optional(),
  })
  .strict();

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
  /** `document.referrer` — only its host is ever kept. */
  r: z.string().max(2048).optional(),
});

export type TrafficBeaconBody = z.infer<typeof trafficBeaconBodySchema>;
