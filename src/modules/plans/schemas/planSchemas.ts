import { z } from "zod";

export const createPlanSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional(),
  price: z.number().positive("Preço deve ser positivo"),
  maxEmployees: z.number().int().min(1, "Mínimo de 1 funcionário"),
  features: z.array(z.string().min(1)).min(1, "Informe ao menos uma feature")
});

export const updatePlanSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(500).optional(),
  price: z.number().positive().optional(),
  maxEmployees: z.number().int().min(1).optional(),
  features: z.array(z.string().min(1)).optional(),
  active: z.boolean().optional()
});

export type CreatePlanInput = z.infer<typeof createPlanSchema>;
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;