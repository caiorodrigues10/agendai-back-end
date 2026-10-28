import { z } from "zod";
import { OWNER_BOT_ALERT_TYPES } from "./ownerBotPreferences";

export const barbershopParamsSchema = z.object({
  barbershopId: z.string().uuid("barbershopId inválido"),
});

const hhmm = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário no formato HH:MM (00:00–23:59)");

export const ownerBotPreferencesUpdateSchema = z
  .object({
    enabled: z.boolean(),
    blocked: z.boolean(),
    briefingEnabled: z.boolean(),
    briefingTime: hhmm,
    summaryEnabled: z.boolean(),
    summaryTime: hhmm,
    alertsEnabled: z.boolean(),
    alertTypes: z.array(z.enum(OWNER_BOT_ALERT_TYPES)).max(OWNER_BOT_ALERT_TYPES.length),
    tone: z.enum(["FRIENDLY", "FORMAL"]),
    language: z.string().min(2).max(10),
  })
  .partial();

export const ownerBotActionLogsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  commandId: z.string().optional(),
  riskClass: z.enum(["READ", "WRITE", "SENSITIVE"]).optional(),
  status: z.enum(["SUCCESS", "ERROR", "NEEDS_CONFIRMATION", "BLOCKED"]).optional(),
});

export const ownerBotLinkCodeResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    code: z.string().length(6),
    expiresAt: z.string(),
    expiresInSeconds: z.number().int().positive(),
  }),
});

export const ownerBotStatusResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    linked: z.boolean(),
    phoneMasked: z.string().nullable(),
    linkedAt: z.string().nullable(),
    botPhone: z.string().nullable(),
    shopPhoneMasked: z.string().nullable(),
    highlights: z.array(z.string()),
    recentActions: z.array(
      z.object({
        id: z.string(),
        action: z.string(),
        status: z.string(),
        createdAt: z.string(),
      })
    ),
  }),
});
