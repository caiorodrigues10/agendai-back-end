import { z } from "zod";

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const createAppointmentSchema = z.object({
  barbershopId: z.string().uuid("barbershopId inválido"),
  serviceId: z.string().uuid("serviceId inválido"),
  staffId: z.string().uuid("staffId inválido").optional().nullable(),
  customerName: z.string().min(2, "Nome obrigatório").max(200),
  whatsapp: z.string().min(8, "WhatsApp inválido").max(20),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data deve ser no formato YYYY-MM-DD"),
  time: z.string().regex(timeRegex, "Hora deve ser no formato HH:MM"),
});

export const updateAppointmentSchema = z.object({
  staffId: z.string().uuid().optional().nullable(),
  customerName: z.string().min(2).max(200).optional(),
  whatsapp: z.string().min(8).max(20).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data deve ser no formato YYYY-MM-DD")
    .optional(),
  time: z.string().regex(timeRegex, "Hora deve ser no formato HH:MM").optional(),
  status: z.enum(["CONFIRMED", "CANCELLED", "COMPLETED"]).optional(),
});

export const listAppointmentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  status: z.enum(["CONFIRMED", "CANCELLED", "COMPLETED"]).optional(),
  staffId: z.string().uuid().optional(),
  search: z.string().max(100).optional(),
});

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;
export type UpdateAppointmentInput = z.infer<typeof updateAppointmentSchema>;
