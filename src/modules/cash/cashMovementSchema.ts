import { z } from "zod";

const dateValue = z.union([
  z.date(),
  z.string().refine(value => !Number.isNaN(new Date(value).getTime()), {
    message: "Data inválida. Use o formato YYYY-MM-DD.",
  }),
]).transform(value => {
  if (value instanceof Date) return value;
  // YYYY-MM-DD é data de calendário: monta como data LOCAL (new Date("2026-09-25")
  // seria meia-noite UTC e o setHours(0,0,0,0) local cairia no dia anterior em hosts não-UTC)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(value);
});

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
    "TIP",
    "OTHER",
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
