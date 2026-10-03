import { z } from "zod";

export const INVOICE_STATUSES = ["PENDING", "PAID", "OVERDUE", "CANCELLED"] as const;

/** Filtros do extrato financeiro em CSV (streaming). */
export const billingStatementQuerySchema = z
  .object({
    status: z.enum(INVOICE_STATUSES).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .strict();

export type BillingStatementQuery = z.infer<typeof billingStatementQuerySchema>;
