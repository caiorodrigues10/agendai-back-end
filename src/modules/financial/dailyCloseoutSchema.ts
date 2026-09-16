import { z } from "zod";

const decimalString = z.string().regex(/^\d+(\.\d{1,2})?$/, "Must be a valid decimal string");

const dateValue = z.union([
  z.date(),
  z.string().refine(value => !Number.isNaN(new Date(value).getTime()), {
    message: "Data inválida. Use o formato YYYY-MM-DD.",
  }),
]).transform(value => value instanceof Date ? value : new Date(value));

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
  cashReceived: z.coerce.number().min(0).default(0),
  pixReceived: z.coerce.number().min(0).default(0),
  cardReceived: z.coerce.number().min(0).default(0),
  fiadoCreated: z.coerce.number().min(0).default(0),
  fiadoPaid: z.coerce.number().min(0).default(0),
  expenses: z.coerce.number().min(0).default(0),
  commissions: z.coerce.number().min(0).default(0),
  productSales: z.coerce.number().min(0).default(0),
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
