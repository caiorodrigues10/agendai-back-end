import { z } from "zod";

/** Telefone do cliente: só dígitos (com DDI opcional), 8 a 15 posições. */
export const aiPhoneSchema = z
  .string()
  .trim()
  .min(8, "Telefone inválido")
  .max(20, "Telefone inválido")
  .regex(/^\+?[\d\s().-]{8,20}$/, "Telefone inválido");

export const processIncomingMessageSchema = z.object({
  phone: aiPhoneSchema,
  content: z.string().trim().min(1, "Mensagem vazia").max(4000, "Mensagem muito longa"),
});

export const listConversationsSchema = z.object({
  status: z.enum(["ACTIVE", "TRANSFERRED_TO_HUMAN", "CLOSED", "EXPIRED"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const intentLogsSchema = z.object({
  intent: z.string().trim().max(100).optional(),
  startDate: z.string().trim().optional(),
  endDate: z.string().trim().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const updateAiSettingsSchema = z.object({
  enabled: z.boolean(),
});
