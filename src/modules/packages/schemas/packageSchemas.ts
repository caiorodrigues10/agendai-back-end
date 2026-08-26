import { z } from "zod";
import { isValidDate, isNotPast, isWithinHorizon, isBusinessHour } from "@/shared/utils/dateUtils";

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

const dateField = z
  .string()
  .refine((v) => isValidDate(v), { message: "Data inválida (use YYYY-MM-DD)" })
  .refine((v) => isNotPast(v), { message: "Data não pode ser no passado" })
  .refine((v) => isWithinHorizon(v), { message: "Data muito distante (máximo 60 dias)" });

const timeField = z
  .string()
  .regex(timeRegex, "Hora deve ser no formato HH:MM")
  .refine((v) => isBusinessHour(v), { message: "Horário fora do comercial (07:00–22:00)" });

export const createServicePackageSchema = z.object({
  barbershopId: z.string().uuid().optional(),
  serviceId: z.string().uuid("serviceId inválido"),
  name: z.string().min(2, "Nome obrigatório").max(100),
  sessionCount: z.number().int().min(2, "Mínimo 2 sessões").max(100),
  price: z.number().min(0, "Preço não pode ser negativo"),
  validityDays: z.number().int().min(1).max(3650).optional().nullable(),
});

export const updateServicePackageSchema = z.object({
  serviceId: z.string().uuid().optional(),
  name: z.string().min(2).max(100).optional(),
  sessionCount: z.number().int().min(2).max(100).optional(),
  price: z.number().min(0).optional(),
  validityDays: z.number().int().min(1).max(3650).optional().nullable(),
  active: z.boolean().optional(),
});

export const listServicePackagesQuerySchema = z.object({
  active: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
});

export const sellClientPackageSchema = z.object({
  barbershopId: z.string().uuid().optional(),
  clientId: z.string().uuid("clientId inválido"),
  packageId: z.string().uuid("packageId inválido"),
  paymentMethod: z.enum(["cash", "pix", "card", "other"]),
});

export const listClientPackagesQuerySchema = z.object({
  clientId: z.string().uuid().optional(),
  status: z.enum(["ACTIVE", "DEPLETED", "EXPIRED", "CANCELLED"]).optional(),
});

export const bookClientPackageSchema = z.object({
  slots: z
    .array(
      z.object({
        date: dateField,
        time: timeField,
        staffId: z.string().uuid().optional().nullable(),
      })
    )
    .min(1, "Informe ao menos um horário")
    .max(20, "Máximo 20 horários por vez"),
});

export type CreateServicePackageInput = z.infer<typeof createServicePackageSchema>;
export type UpdateServicePackageInput = z.infer<typeof updateServicePackageSchema>;
export type SellClientPackageInput = z.infer<typeof sellClientPackageSchema>;
export type BookClientPackageInput = z.infer<typeof bookClientPackageSchema>;
