import { z } from "zod";

export const OVERVIEW_PERIODS = ["today", "7d", "30d", "90d", "12m"] as const;

export type OverviewPeriod = (typeof OVERVIEW_PERIODS)[number];

export const adminOverviewQuerySchema = z.object({
  period: z.enum(OVERVIEW_PERIODS).optional().default("30d"),
}).strict();
