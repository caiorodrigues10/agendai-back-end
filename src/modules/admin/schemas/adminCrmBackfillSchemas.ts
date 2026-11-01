import { z } from "zod";

export const adminCrmBackfillRunsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
    status: z.enum(["RUNNING", "SUCCEEDED", "FAILED"]).optional(),
    scope: z.enum(["TENANT", "GLOBAL"]).optional(),
    barbershopId: z.string().uuid("id inválido").optional(),
  })
  .strict();

export type AdminCrmBackfillRunsQuery = z.infer<
  typeof adminCrmBackfillRunsQuerySchema
>;
