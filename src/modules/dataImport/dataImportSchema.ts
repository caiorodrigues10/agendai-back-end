/**
 * Schemas (Zod) das rotas de importação.
 *
 * A entrada é sempre validada na borda: nada de arquivo, coluna ou opção
 * entra no use case sem passar por aqui.
 */
import { z } from "zod";

/** Campos de destino aceitos no mapa (união de todos os alvos). */
const importFieldKeySchema = z.enum([
  "name",
  "whatsapp",
  "email",
  "birthDate",
  "notes",
  "serviceName",
  "description",
  "price",
  "durationMinutes",
  "category",
  "clientName",
  "clientWhatsapp",
  "staffName",
  "date",
  "time",
  "status",
  "finalPrice",
  "paymentMethod",
  "modality",
  "caseName",
  "practiceArea",
]);

export const importTargetSchema = z.enum(["CLIENTS", "SERVICES", "APPOINTMENTS"]);

export const importBatchParamsSchema = z.object({
  barbershopId: z.string().uuid(),
  batchId: z.string().uuid(),
});

export const targetQuerySchema = z.object({
  target: importTargetSchema.default("CLIENTS"),
});

export const configureTargetSchema = z.object({
  targetType: importTargetSchema,
  sheetName: z.string().max(120).nullable().optional(),
});

export const importOptionsSchema = z.object({
  updateExisting: z.boolean().optional(),
  countFinancialValues: z.boolean().optional(),
  sendReviewInvitations: z.boolean().optional(),
  includeCase: z.boolean().optional(),
});

export const mappingSchema = z.object({
  /** Índice da coluna (texto) → campo de destino. */
  columns: z.record(z.string().regex(/^\d+$/), importFieldKeySchema),
  options: importOptionsSchema.optional(),
});

export const confirmImportSchema = z.object({}).passthrough();
