import { z } from "zod";

/** Prisma Role enum values allowed on staff portal routes (authorize() string-compares). */
export const CLIENT_PORTAL_STAFF_ROLES = ["MASTER_ADMIN", "OWNER", "EMPLOYEE"] as const;
export const CLIENT_PORTAL_OWNER_ROLES = ["MASTER_ADMIN", "OWNER"] as const;

export const requestOtpSchema = z.object({
  phone: z
    .string()
    .min(10, "Telefone obrigatório")
    .max(20, "Telefone muito longo"),
  name: z.string().min(1, "Nome obrigatório").max(200).optional(),
});

export const verifyOtpSchema = z.object({
  phone: z.string().min(10),
  code: z
    .string()
    .length(6, "Código deve ter 6 dígitos")
    .regex(/^\d+$/, "Código deve conter apenas números"),
});

export const requestLinkSchema = z.object({
  barbershopId: z.string().uuid(),
  salonClientId: z.string().uuid().optional(),
});

export const confirmLinkSchema = z.object({
  confirmedById: z.string().uuid().optional(),
});

export const rejectLinkSchema = z.object({
  rejectedById: z.string().uuid().optional(),
  reason: z.string().max(300).optional(),
});

export const createCareTemplateSchema = z.object({
  serviceId: z.string().uuid().optional(),
  title: z.string().min(1).max(200),
  content: z.string().min(1),
});

export const updateCareTemplateSchema = createCareTemplateSchema.partial();

export const sendCareInstructionSchema = z.object({
  identityId: z.string().uuid(),
  appointmentId: z.string().uuid().optional(),
  templateId: z.string().uuid().optional(),
  title: z.string().min(1).max(200),
  content: z.string().min(1),
});

export const clientPortalQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const barbershopIdQuerySchema = z.object({
  barbershopId: z.string().uuid(),
});

export const staffDashboardQuerySchema = z.object({
  identityId: z.string().uuid(),
});

export const linkIdParamsSchema = z.object({
  linkId: z.string().uuid(),
});
