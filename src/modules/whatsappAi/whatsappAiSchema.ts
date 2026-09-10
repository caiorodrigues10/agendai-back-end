import { z } from "zod";

export const processIncomingMessageSchema = z.object({
  phone: z.string().min(1),
  content: z.string().min(1),
});

export const listConversationsSchema = z.object({
  status: z.enum(["ACTIVE", "TRANSFERRED_TO_HUMAN", "CLOSED", "EXPIRED"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const intentLogsSchema = z.object({
  intent: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
