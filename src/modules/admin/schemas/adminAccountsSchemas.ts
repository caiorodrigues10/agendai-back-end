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

/** Motivo obrigatório de toda ação de controle sobre contas (auditoria + diálogo de confirmação). */
export const accountActionReasonSchema = z
  .string()
  .trim()
  .min(10, "Informe um motivo com pelo menos 10 caracteres")
  .max(500);

export const adminAccountReasonSchema = z.object({ reason: accountActionReasonSchema }).strict();

export const adminAccountExtendTrialSchema = z
  .object({
    reason: accountActionReasonSchema,
    days: z.number().int().min(1).max(90),
  })
  .strict();

export const adminAccountChangePlanSchema = z
  .object({
    reason: accountActionReasonSchema,
    planId: z.string().uuid("planId inválido"),
  })
  .strict();
