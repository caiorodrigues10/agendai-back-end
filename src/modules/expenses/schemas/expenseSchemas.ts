import { z } from "zod";

export const createExpenseSchema = z.object({
  categoryId: z.string().uuid().optional().nullable(),
  title: z.string().min(2).max(200),
  description: z.string().max(1000).optional().nullable(),
  amount: z.number().positive("Valor deve ser positivo"),
  type: z.enum(["FIXED", "VARIABLE", "INVESTMENT"]).default("VARIABLE"),
  recurrence: z.enum(["ONCE", "DAILY", "WEEKLY", "MONTHLY", "YEARLY"]).default("ONCE"),
  referenceDate: z.coerce.date({ required_error: "Data de referência obrigatória" }),
  paidAt: z.coerce.date().optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
  paymentMethod: z.string().max(50).optional().nullable(),
  supplierName: z.string().max(200).optional().nullable(),
  receiptUrl: z.string().url().max(500).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

export const updateExpenseSchema = z.object({
  categoryId: z.string().uuid().optional().nullable(),
  title: z.string().min(2).max(200).optional(),
  description: z.string().max(1000).optional().nullable(),
  amount: z.number().positive().optional(),
  type: z.enum(["FIXED", "VARIABLE", "INVESTMENT"]).optional(),
  recurrence: z.enum(["ONCE", "DAILY", "WEEKLY", "MONTHLY", "YEARLY"]).optional(),
  referenceDate: z.coerce.date().optional(),
  paidAt: z.coerce.date().optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
  paymentMethod: z.string().max(50).optional().nullable(),
  supplierName: z.string().max(200).optional().nullable(),
  receiptUrl: z.string().url().max(500).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

export const listExpensesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  categoryId: z.string().uuid().optional(),
  type: z.enum(["FIXED", "VARIABLE", "INVESTMENT"]).optional(),
  recurrence: z.enum(["ONCE", "DAILY", "WEEKLY", "MONTHLY", "YEARLY"]).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  paid: z.enum(["true", "false"]).transform(v => v === "true").optional(),
  search: z.string().max(100).optional(),
});

export const expenseSummaryQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});