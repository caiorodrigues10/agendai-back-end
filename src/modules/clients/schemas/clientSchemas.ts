import { z } from "zod";

const phoneBR = z
  .string()
  .transform((v) => v.replace(/\D/g, ""))
  .refine((v) => v.length >= 10 && v.length <= 11, {
    message: "WhatsApp inválido (DDD + número com 8 ou 9 dígitos)",
  });

export const createClientSchema = z.object({
  barbershopId: z.string().uuid().optional(),
  name: z.string().min(2, "Nome obrigatório").max(200),
  whatsapp: phoneBR.optional().or(z.literal("")),
  notes: z.string().max(2000).optional().nullable(),
  marketingOptIn: z.boolean().optional(),
  marketingOptInSource: z.string().max(80).optional().nullable(),
});

export const updateClientSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  whatsapp: phoneBR.optional(),
  notes: z.string().max(2000).optional().nullable(),
  marketingOptIn: z.boolean().optional(),
  marketingOptInSource: z.string().max(80).optional().nullable(),
});

export const listClientsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(100).optional(),
});

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
export type ListClientsQueryInput = z.infer<typeof listClientsQuerySchema>;
