import { z } from "zod";

export const adminAccountsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
    search: z.string().max(100).optional(),
    status: z.enum(["active", "inactive"]).optional(),
    approval: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
    sort: z.enum(["recent", "oldest", "name"]).optional().default("recent"),
  })
  .strict();

export const adminAccountIdParamsSchema = z
  .object({
    id: z.string().uuid(),
  })
  .strict();

export type AdminAccountsQuery = z.infer<typeof adminAccountsQuerySchema>;
