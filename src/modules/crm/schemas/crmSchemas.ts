import { z } from "zod";

export const crmPeriodSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  compare: z.enum(["true", "false"]).optional().transform((value) => value === "true"),
  barbershopId: z.string().uuid().optional(),
});

export const crmClientsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(100).optional(),
  segment: z.enum(["all", "new", "recurring", "vip", "at_risk", "inactive_30", "inactive_60", "inactive_90", "debtors", "package_expiring", "low_demand"]).optional(),
  sort: z.enum(["ltv", "lastVisit", "outstanding"]).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  barbershopId: z.string().uuid().optional(),
});

export const crmCampaignsListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["DRAFT", "QUEUED", "SENT", "PARTIAL", "FAILED", "CANCELED"]).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  barbershopId: z.string().uuid().optional(),
});

export const crmForecastSchema = z.object({ horizon: z.coerce.number().int().refine((value) => [7, 30, 90].includes(value), "Horizonte deve ser 7, 30 ou 90"), barbershopId: z.string().uuid().optional() });
export const mergeClientsSchema = z.object({ targetId: z.string().uuid(), sourceIds: z.array(z.string().uuid()).min(1), barbershopId: z.string().uuid().optional() });
export const campaignSchema = z.object({ name: z.string().min(3).max(160), segment: z.enum(["all", "new", "recurring", "vip", "at_risk", "inactive_30", "inactive_60", "inactive_90", "debtors", "package_expiring", "low_demand"]), message: z.string().min(3).max(2000), barbershopId: z.string().uuid().optional(), clientIds: z.array(z.string().uuid()).max(1000).optional() });
