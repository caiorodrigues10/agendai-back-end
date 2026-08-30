import { z } from "zod";

export const createFiadoSchema = z.object({
  barbershopId: z.string().uuid().optional(),
  customerName: z.string().min(2, "Nome obrigatório").max(200),
  whatsapp: z
    .string()
    .transform((value) => value.replace(/\D/g, ""))
    .refine((value) => value.length >= 10 && value.length <= 13, {
      message: "WhatsApp inválido: informe DDD e telefone",
    }),
  description: z.string().min(2, "Descrição obrigatória").max(500),
  amount: z.number().positive("Valor deve ser positivo"),
  dueDate: z.coerce.date().optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

export const createFiadoPaymentSchema = z.object({
  barbershopId: z.string().uuid().optional(),
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

export const chargeFiadoSchema = z
  .object({
    pixKey: z.string().trim().max(200).optional().or(z.literal("")),
    cardPaymentLink: z.string().trim().url("Link de cartão inválido").max(500).optional().or(z.literal("")),
  })
  .refine((data) => Boolean(data.pixKey || data.cardPaymentLink), {
    message: "Informe uma chave PIX ou um link para pagamento com cartão",
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
export type ChargeFiadoInput = z.infer<typeof chargeFiadoSchema>;
