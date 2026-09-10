import { z } from "zod";

export const fiscalConfigSchema = z.object({
  cnpj: z.string().min(14).max(20),
  stateRegistration: z.string().max(20).optional().nullable(),
  municipalRegistration: z.string().max(20).optional().nullable(),
  serviceCode: z.string().max(20).optional().nullable(),
  activityCode: z.string().max(20).optional().nullable(),
  nfeEnabled: z.boolean().default(false),
  nfeEnvironment: z.enum(["HOMOLOGATION", "PRODUCTION"]).default("HOMOLOGATION"),
  digitalCertPath: z.string().max(500).optional().nullable(),
});

export const issueNfeSchema = z.object({
  appointmentId: z.string().uuid().optional().nullable(),
  recipientName: z.string().min(1).max(200),
  recipientDoc: z.string().min(11).max(20),
  serviceValue: z.coerce.number().positive(),
  taxValue: z.coerce.number().min(0).default(0),
});

export const nfeQuerySchema = z.object({
  status: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const fiscalStatsQuerySchema = z.object({
  months: z.coerce.number().int().min(1).max(24).default(6),
});

export type FiscalConfigInput = z.infer<typeof fiscalConfigSchema>;
export type IssueNfeInput = z.infer<typeof issueNfeSchema>;
export type NfeQueryInput = z.infer<typeof nfeQuerySchema>;
export type FiscalStatsQueryInput = z.infer<typeof fiscalStatsQuerySchema>;
