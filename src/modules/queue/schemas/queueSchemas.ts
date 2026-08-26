import { z } from "zod";

export const updateQueueItemSchema = z.object({
  status: z.enum(["waiting", "in_chair", "completed", "cancelled"]),
  completedBy: z.string().uuid().optional(),
  finalPrice: z.number().min(0).optional(),
}).strict();
