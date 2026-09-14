import { z } from "zod";

export const createCashMovementSchema = z.object({
  type: z.enum([
    "SERVICE_SALE",
    "PRODUCT_SALE",
    "PACKAGE_SALE",
    "FIADO_PAYMENT",
    "EXPENSE",
    "REFUND",
    "SUPPLY",
    "WITHDRAWAL",
    "ADJUSTMENT",
  ]),
  amount: z.coerce.number(),
  paymentMethod: z.enum(["CASH", "PIX", "CREDIT_CARD", "DEBIT_CARD", "FIADO"]),
  description: z.string().max(300).optional().nullable(),
  sourceType: z.enum(["APPOINTMENT", "RETAIL_SALE", "FIADO", "MANUAL"]).optional().nullable(),
  sourceId: z.string().optional().nullable(),
  idempotencyKey: z.string().max(100).optional().nullable(),
});

export const cashMovementQuerySchema = z.object({
  date: z.coerce.date().optional(),
  paymentMethod: z.string().optional(),
  type: z.string().optional(),
});

export const cashSummaryQuerySchema = z.object({
  date: z.preprocess(
    value => (value === undefined || value === null || value === "" ? new Date() : value),
    z.coerce.date()
  ),
});

export type CreateCashMovementInput = z.infer<typeof createCashMovementSchema>;
export type CashMovementQueryInput = z.infer<typeof cashMovementQuerySchema>;
export type CashSummaryQueryInput = z.infer<typeof cashSummaryQuerySchema>;
