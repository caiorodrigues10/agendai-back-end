import { z } from "zod";

export const createBarbershopSchema = z.object({
  name: z.string().min(2).max(200),
  whatsapp: z.string().min(8).max(20),
  logoUrl: z.string().url().max(500).optional(),
  cnpj: z.string().min(14).max(18).optional()
});

export const updateBarbershopSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  whatsapp: z.string().min(8).max(20).optional(),
  logoUrl: z.string().url().max(500).nullable().optional(),
  active: z.boolean().optional(),
  /**
   * Nome da instância da Evolution API desta barbearia.
   * Aceita string (1..100), null, ou string vazia — string vazia é normalizada
   * para null (= "usar fallback da env var global").
   */
  evolutionInstanceName: z
    .union([z.string().min(1).max(100), z.null(), z.literal("")])
    .optional(),
});

export const scheduleItemSchema = z.object({
  dayOfWeek: z.number().min(0).max(6),
  isOpen: z.boolean(),
  openTime: z.string().min(4).max(5),
  closeTime: z.string().min(4).max(5)
});

export const updateScheduleSchema = z.array(scheduleItemSchema).min(1);
