import { z } from "zod";

const dateValue = z.union([
  z.date(),
  z.string().refine(value => !Number.isNaN(new Date(value).getTime()), {
    message: "Data inválida. Use o formato YYYY-MM-DD.",
  }),
]).transform(value => value instanceof Date ? value : new Date(value));

const optionalDateQuery = z.preprocess(
  value => {
    if (value === undefined || value === null || value === "") return undefined;
    return value;
  },
  dateValue.optional()
);

const dailyDateQuery = z.preprocess(
  value => {
    if (value === undefined || value === null || value === "") return new Date();
    return value;
  },
  dateValue
);

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
  amount: z.coerce.number().positive("O valor deve ser maior que zero"),
  paymentMethod: z.enum(["CASH", "PIX", "CREDIT_CARD", "DEBIT_CARD", "FIADO"]),
  description: z.string().max(300).optional().nullable(),
  sourceType: z.enum(["APPOINTMENT", "RETAIL_SALE", "FIADO", "MANUAL"]).optional().nullable(),
  sourceId: z.string().optional().nullable(),
  idempotencyKey: z.string().max(100).optional().nullable(),
});

export const cashMovementQuerySchema = z.object({
  date: optionalDateQuery,
  paymentMethod: z.string().optional(),
  type: z.string().optional(),
});

export const cashSummaryQuerySchema = z.object({
  date: dailyDateQuery,
});

export type CreateCashMovementInput = z.infer<typeof createCashMovementSchema>;
export type CashMovementQueryInput = z.infer<typeof cashMovementQuerySchema>;
export type CashSummaryQueryInput = z.infer<typeof cashSummaryQuerySchema>;
