import { z } from "zod";

const billingCycleSchema = z.enum(["MONTHLY", "YEARLY"]);

export const createPlanSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional(),
  price: z.number().positive("Preço deve ser positivo"),
  billingCycle: billingCycleSchema.optional().default("MONTHLY"),
  /** 0 = funcionários ilimitados */
  maxEmployees: z.number().int().min(0).default(0),
  hasDashboard: z.boolean().optional().default(true),
  tierKey: z.string().min(1).max(40).optional().default("pro"),
  features: z.array(z.string().min(1)).min(1, "Informe ao menos uma feature"),
});

export const updatePlanSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(500).optional(),
  price: z.number().positive().optional(),
  billingCycle: billingCycleSchema.optional(),
  maxEmployees: z.number().int().min(0).optional(),
  hasDashboard: z.boolean().optional(),
  tierKey: z.string().min(1).max(40).optional(),
  features: z.array(z.string().min(1)).optional(),
  active: z.boolean().optional(),
});

export type CreatePlanInput = z.infer<typeof createPlanSchema>;
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;
