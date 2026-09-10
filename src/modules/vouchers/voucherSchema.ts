import { z } from "zod";

export const voucherTypeMap = {
  percent: "PERCENT",
  fixed: "FIXED",
  free_service: "FREE_SERVICE",
  buy_x_get_y: "BUY_X_GET_Y",
} as const;

export const createVoucherSchema = z.object({
  code: z.string().min(1).max(30).transform((v) => v.toUpperCase()),
  description: z.string().max(500).optional().nullable(),
  type: z.enum(["percent", "fixed", "free_service", "buy_x_get_y"]),
  value: z.number().min(0),
  minPurchase: z.number().min(0).optional().nullable(),
  maxUses: z.number().int().min(1).optional().nullable(),
  perClientLimit: z.number().int().min(1).default(1),
  applicableServiceIds: z.array(z.string().uuid()).optional().nullable(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  isActive: z.boolean().default(true),
});

export const updateVoucherSchema = z.object({
  code: z.string().min(1).max(30).transform((v) => v.toUpperCase()).optional(),
  description: z.string().max(500).optional().nullable(),
  type: z.enum(["percent", "fixed", "free_service", "buy_x_get_y"]).optional(),
  value: z.number().min(0).optional(),
  minPurchase: z.number().min(0).optional().nullable(),
  maxUses: z.number().int().min(1).optional().nullable(),
  perClientLimit: z.number().int().min(1).optional(),
  applicableServiceIds: z.array(z.string().uuid()).optional().nullable(),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional(),
  isActive: z.boolean().optional(),
});

export const validateVoucherSchema = z.object({
  code: z.string().min(1).max(30),
  serviceId: z.string().uuid().optional().nullable(),
  clientId: z.string().uuid().optional().nullable(),
});

export const applyVoucherSchema = z.object({
  voucherId: z.string().uuid(),
  serviceId: z.string().uuid().optional().nullable(),
  clientId: z.string().uuid().optional().nullable(),
  appointmentId: z.string().uuid().optional().nullable(),
  originalAmount: z.number().min(0),
});
