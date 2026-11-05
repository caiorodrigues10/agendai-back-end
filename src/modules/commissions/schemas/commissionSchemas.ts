import { z } from "zod";
import { paginationQuerySchema as basePaginationQuerySchema } from "@/shared/utils/pagination";

export const listCommissionsQuerySchema = basePaginationQuerySchema({
  defaultLimit: 20,
  maxLimit: 100,
}).extend({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  professionalId: z.string().uuid().optional(),
  origin: z.enum(["QUEUE", "APPOINTMENT"]).optional(),
});
