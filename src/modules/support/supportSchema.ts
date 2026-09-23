import { z } from "zod";

export const createReportSchema = z.object({
  title: z.string().trim().min(5).max(200),
  description: z.string().trim().min(10).max(4000),
  category: z.enum([
    "ERROR",
    "SUGGESTION",
    "FEEDBACK",
    "QUESTION",
    "BILLING",
    "ACCESS",
    "SCHEDULE",
  ]),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional().default("NORMAL"),
  page: z
    .string()
    .optional()
    .transform(v => (v ? v.slice(0, 200) : undefined)),
  userAgent: z
    .string()
    .optional()
    .transform(v => (v ? v.slice(0, 300) : undefined)),
});

export const listMyReportsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(10),
  status: z
    .enum(["OPEN", "IN_PROGRESS", "WAITING_SHOP", "RESOLVED", "CANCELLED"])
    .optional(),
});

export const addCommentSchema = z.object({
  text: z.string().trim().min(1).max(2000),
});

export type CreateReportInput = z.infer<typeof createReportSchema>;
export type ListMyReportsQuery = z.infer<typeof listMyReportsQuerySchema>;
