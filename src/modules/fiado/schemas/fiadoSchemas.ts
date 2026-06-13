import { z } from "zod";

export const createFiadoSchema = z.object({
  customerName: z.string().min(2, "Nome obrigatório").max(200),
  whatsapp: z.string().min(8, "WhatsApp inválido").max(20),
  description: z.string().min(2, "Descrição obrigatória").max(500),
  amount: z.number().positive("Valor deve ser positivo"),
  dueDate: z.coerce.date().optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

export const createFiadoPaymentSchema = z.object({
  amount: z.number().positive("Valor deve ser positivo"),
  notes: z.string().max(1000).optional().nullable(),
});

export const updateFiadoSchema = z.object({
  description: z.string().min(2).max(500).optional(),
  amount: z.number().positive().optional(),
  dueDate: z.coerce.date().optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  status: z.enum(["PENDING", "PARTIAL", "PAID", "FORGIVEN"]).optional(),
});

export const addFiadoPaymentSchema = z.object({
  amount: z.number().positive("Valor deve ser positivo"),
  notes: z.string().max(1000).optional().nullable(),
});

export const listFiadoQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["PENDING", "PARTIAL", "PAID", "FORGIVEN"]).optional(),
  search: z.string().max(100).optional(),
  overdue: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export type CreateFiadoInput = z.infer<typeof createFiadoSchema>;
export type UpdateFiadoInput = z.infer<typeof updateFiadoSchema>;
export type AddFiadoPaymentInput = z.infer<typeof addFiadoPaymentSchema>;
export type ListFiadoQueryInput = z.infer<typeof listFiadoQuerySchema>;