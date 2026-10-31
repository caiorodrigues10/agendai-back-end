/**
 * Schemas (Zod) das rotas de exportação.
 */
import { z } from "zod";
import { EXPORT_PERIOD_PRESETS } from "./utils/exportPeriod";

const periodPresetSchema = z.enum([
  "TODAY",
  "THIS_WEEK",
  "THIS_MONTH",
  "LAST_3_MONTHS",
  "LAST_6_MONTHS",
  "LAST_12_MONTHS",
  "CUSTOM",
  "ALL",
]);

const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use o formato yyyy-mm-dd.");

const moduleKeySchema = z.enum([
  "appointments",
  "clients",
  "services",
  "team",
  "financial",
  "commissions",
  "products",
  "sales",
  "packages",
  "fiado",
  "queue",
  "waitlist",
  "reviews",
  "loyalty",
  "posts",
  "settings",
]);

/** POST /barbershops/:barbershopId/exports */
export const createExportSchema = z
  .object({
    periodPreset: periodPresetSchema,
    dateFrom: dateOnlySchema.optional(),
    dateTo: dateOnlySchema.optional(),
    modules: z.array(moduleKeySchema).min(1).max(30).optional(),
    preset: z.enum(["GERENTIAL", "BACKUP"]).optional(),
    format: z.enum(["XLSX", "CSV_ZIP"]).optional(),
    options: z
      .object({
        anonymize: z.boolean().optional(),
        includeCase: z.boolean().optional(),
      })
      .optional(),
  })
  .strict();

export type CreateExportBody = z.infer<typeof createExportSchema>;

/** /exports/:exportId */
export const exportJobParamsSchema = z.object({
  barbershopId: z.string().uuid(),
  exportId: z.string().uuid(),
});

/** Validar o preset e as datas de CUSTOM na borda. */
export function assertPeriodBody(body: CreateExportBody): void {
  if (body.periodPreset === "CUSTOM" && (!body.dateFrom || !body.dateTo)) {
    throw new Error("Período personalizado exige dateFrom e dateTo.");
  }
  if (body.periodPreset !== "CUSTOM" && (body.dateFrom || body.dateTo)) {
    // Ignorados de propósito: o preset manda.
  }
}

export { EXPORT_PERIOD_PRESETS };
