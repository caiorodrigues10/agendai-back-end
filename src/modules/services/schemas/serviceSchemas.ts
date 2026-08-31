import { z } from "zod";

export const createServiceSchema = z.object({
  barbershopId: z.string().uuid(),
  name: z.string().min(2).max(100),
  price: z.number().min(0),
  avgTimeMinutes: z.number().min(1),
  icon: z.string().min(1).max(50),
  commissionPercent: z.number().min(0).max(100).optional()
});

export const updateServiceSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  price: z.number().min(0).optional(),
  avgTimeMinutes: z.number().min(1).optional(),
  icon: z.string().min(1).max(50).optional(),
  active: z.boolean().optional(),
  commissionPercent: z.number().min(0).max(100).optional()
});
