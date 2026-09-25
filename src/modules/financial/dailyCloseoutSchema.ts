import { z } from "zod";

const decimalString = z.string().regex(/^\d+(\.\d{1,2})?$/, "Must be a valid decimal string");

const dateValue = z.union([
  z.date(),
  z.string().refine(value => !Number.isNaN(new Date(value).getTime()), {
    message: "Data inválida. Use o formato YYYY-MM-DD.",
  }),
]).transform(value => {
  if (value instanceof Date) return value;
  // YYYY-MM-DD é data de calendário: monta como data LOCAL (new Date("2026-09-25")
  // seria meia-noite UTC e cairia no dia anterior em hosts não-UTC)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(value);
});

function safeDateField(requiredError: string) {
  return z.preprocess(
    (value) => {
      if (value === "") return undefined;
      return value;
    },
    dateValue.refine(Boolean, { message: requiredError })
  );
}

export const createCloseoutSchema = z.object({
  barbershopId: z.string().uuid().optional(),
  date: safeDateField("Date is required"),
  balanceOpen: z.coerce.number().min(0).default(0),
  // Omitido => agrega do CashMovement do dia; explícito (inclusive 0) => valor declarado
  cashReceived: z.coerce.number().min(0).optional(),
  pixReceived: z.coerce.number().min(0).optional(),
  cardReceived: z.coerce.number().min(0).optional(),
  discrepancy: z.coerce.number().optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

export const closeoutQuerySchema = z.object({
  date: safeDateField("Date query param is required"),
});

export const closeoutRangeQuerySchema = z.object({
  startDate: safeDateField("startDate is required"),
  endDate: safeDateField("endDate is required"),
});

export type CreateCloseoutInput = z.infer<typeof createCloseoutSchema>;
export type CloseoutQueryInput = z.infer<typeof closeoutQuerySchema>;
export type CloseoutRangeQueryInput = z.infer<typeof closeoutRangeQuerySchema>;
