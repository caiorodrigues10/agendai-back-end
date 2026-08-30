import { z } from "zod";
import { isValidCnpj, normalizeCnpj } from "@/shared/utils/cpfUtils";

const phoneBR = z
  .string()
  .transform((v) => v.replace(/\D/g, ""))
  .refine((v) => v.length >= 10 && v.length <= 11, {
    message: "WhatsApp inválido (DDD + número com 8 ou 9 dígitos)",
  });

export const createBarbershopSchema = z.object({
  name: z.string().min(2).max(200),
  whatsapp: phoneBR,
  logoUrl: z.string().url().max(500).optional(),
  cnpj: z
    .string()
    .optional()
    .refine((v) => !v || isValidCnpj(v), { message: "CNPJ inválido (dígitos verificadores incorretos)" })
    .transform((v) => (v ? normalizeCnpj(v) : v)),
  address: z.string().max(500).optional(),
  city: z.string().max(120).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

export const updateBarbershopSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  whatsapp: phoneBR.optional(),
  logoUrl: z.string().url().max(500).nullable().optional(),
  active: z.boolean().optional(),
  cnpj: z
    .string()
    .optional()
    .refine((v) => !v || isValidCnpj(v), { message: "CNPJ inválido (dígitos verificadores incorretos)" })
    .transform((v) => (v ? normalizeCnpj(v) : v)),
  address: z.string().max(500).nullable().optional(),
  city: z.string().max(120).nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
});

export const scheduleItemSchema = z.object({
  dayOfWeek: z.number().min(0).max(6),
  isOpen: z.boolean(),
  openTime: z.string().min(4).max(5),
  closeTime: z.string().min(4).max(5)
});

export const updateScheduleSchema = z.array(scheduleItemSchema).min(1);
