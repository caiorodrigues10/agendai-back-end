import { z } from "zod";

export const respondToReviewSchema = z.object({
  content: z.string().min(1).max(1000),
});

export const reputationQuerySchema = z.object({
  barbershopId: z.string().uuid(),
});
