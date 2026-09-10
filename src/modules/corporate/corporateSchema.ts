import { z } from "zod";

export const createCorporatePlanSchema = z.object({
  name: z.string().min(1).max(200),
  companyName: z.string().min(1).max(200),
  cnpj: z.string().max(20).optional().nullable(),
  contactEmail: z.string().email().max(200),
  contactPhone: z.string().max(20).optional().nullable(),
  maxUnits: z.number().int().min(1).default(1),
  pricePerUnit: z.number().min(0),
  billingCycle: z.enum(["monthly", "quarterly", "yearly"]).default("monthly"),
});

export const updateCorporatePlanSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  companyName: z.string().min(1).max(200).optional(),
  cnpj: z.string().max(20).optional().nullable(),
  contactEmail: z.string().email().max(200).optional(),
  contactPhone: z.string().max(20).optional().nullable(),
  maxUnits: z.number().int().min(1).optional(),
  pricePerUnit: z.number().min(0).optional(),
  billingCycle: z.enum(["monthly", "quarterly", "yearly"]).optional(),
  status: z.enum(["pending", "active", "suspended", "canceled"]).optional(),
  startedAt: z.string().optional().nullable(),
  expiresAt: z.string().optional().nullable(),
});

export const subscribeBarbershopSchema = z.object({
  barbershopId: z.string().uuid(),
});

export const corporatePlanStatusMap = {
  pending: "PENDING",
  active: "ACTIVE",
  suspended: "SUSPENDED",
  canceled: "CANCELED",
} as const;

export const billingCycleMap = {
  monthly: "MONTHLY",
  quarterly: "QUARTERLY",
  yearly: "YEARLY",
} as const;

export const corporateSubStatusMap = {
  active: "ACTIVE",
  expired: "EXPIRED",
  canceled: "CANCELED",
  suspended: "SUSPENDED",
} as const;
