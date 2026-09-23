import { z } from "zod";

export const createRecurringPackagePlanSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional().nullable(),
  price: z.number().min(0),
  billingCycle: z.enum(["MONTHLY", "QUARTERLY", "YEARLY"]),
  maxMembers: z.number().min(0).default(0),
  benefits: z.array(z.object({
    name: z.string().min(1).max(100),
    type: z.enum(["DISCOUNT_PERCENT", "DISCOUNT_AMOUNT", "FREE_SERVICE", "FREE_PRODUCT", "PRIORITY_BOOKING"]),
    value: z.number().min(0),
    serviceId: z.string().uuid().optional().nullable(),
    maxUsesPerCycle: z.number().min(0).optional().nullable(),
  })).optional().default([]),
});

export const updateRecurringPackagePlanSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  price: z.number().min(0).optional(),
  billingCycle: z.enum(["MONTHLY", "QUARTERLY", "YEARLY"]).optional(),
  maxMembers: z.number().min(0).optional(),
  active: z.boolean().optional(),
  benefits: z.array(z.object({
    id: z.string().uuid().optional(),
    name: z.string().min(1).max(100),
    type: z.enum(["DISCOUNT_PERCENT", "DISCOUNT_AMOUNT", "FREE_SERVICE", "FREE_PRODUCT", "PRIORITY_BOOKING"]),
    value: z.number().min(0),
    serviceId: z.string().uuid().optional().nullable(),
    maxUsesPerCycle: z.number().min(0).optional().nullable(),
  })).optional(),
});

export const createClientRecurringPackageSchema = z.object({
  planId: z.string().uuid(),
  clientId: z.string().uuid(),
});

export const recordPaymentSchema = z.object({
  paymentMethod: z.enum(["CASH", "PIX", "CREDIT_CARD", "DEBIT_CARD", "TRANSFER"]),
  amount: z.number().min(0).optional(),
  notes: z.string().max(300).optional(),
  idempotencyKey: z.string().max(100).optional(),
});

export const useBenefitSchema = z.object({
  appointmentId: z.string().uuid(),
});

export const recurringPackageListQuerySchema = z.object({
  status: z.string().optional(),
  clientId: z.string().uuid().optional(),
  planId: z.string().uuid().optional(),
  page: z.coerce.number().min(1).default(1).optional(),
  limit: z.coerce.number().min(1).max(100).default(20).optional(),
});

export type CreateRecurringPackagePlanInput = z.infer<typeof createRecurringPackagePlanSchema>;
export type UpdateRecurringPackagePlanInput = z.infer<typeof updateRecurringPackagePlanSchema>;
export type CreateClientRecurringPackageInput = z.infer<typeof createClientRecurringPackageSchema>;
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
export type UseBenefitInput = z.infer<typeof useBenefitSchema>;
export type RecurringPackageListQueryInput = z.infer<typeof recurringPackageListQuerySchema>;
