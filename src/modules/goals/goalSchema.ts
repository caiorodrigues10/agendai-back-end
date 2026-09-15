import { z } from "zod";

export const createGoalSchema = z.object({
  professionalId: z.string().uuid(),
  metric: z.enum(["REVENUE", "APPOINTMENTS", "PRODUCTS_SOLD"]),
  target: z.coerce.number().min(0),
  period: z.enum(["WEEKLY", "MONTHLY", "QUARTERLY"]).default("MONTHLY"),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
});

export const updateGoalSchema = z.object({
  target: z.coerce.number().min(0).optional(),
  endDate: z.coerce.date().optional(),
});

export const goalQuerySchema = z.object({
  professionalId: z.string().uuid().optional(),
  period: z.string().optional(),
});

const dateQueryParam = z
  .string()
  .trim()
  .optional()
  .transform(value => (value ? new Date(value) : undefined))
  .refine(value => value === undefined || !Number.isNaN(value.getTime()), {
    message: "Invalid date",
  });

export const goalRankingQuerySchema = z.object({
  metric: z.enum(["REVENUE", "APPOINTMENTS", "PRODUCTS_SOLD"]).optional(),
  startDate: dateQueryParam,
  endDate: dateQueryParam,
  from: dateQueryParam,
  to: dateQueryParam,
});

export type CreateGoalInput = z.infer<typeof createGoalSchema>;
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;
export type GoalQueryInput = z.infer<typeof goalQuerySchema>;
export type GoalRankingQueryInput = z.infer<typeof goalRankingQuerySchema>;
