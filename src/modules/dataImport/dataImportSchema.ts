/**
 * Schemas (Zod) das rotas de importação.
 *
 * A entrada é sempre validada na borda: nada de arquivo, coluna ou opção
 * entra no use case sem passar por aqui.
 *
 * Duas formas convivem na API:
 *   • **legada** (Fase 1) — `targetType` + `sheetName` e `columns` + `options`
 *     para uma aba só;
 *   • **multi-aba** (Fase 2) — `sheets: [{ sheetName, targetType, columns,
 *     options }]`, com um tipo por aba.
 */
import { z } from "zod";

/** Campos de destino aceitos no mapa (união de todos os alvos). */
const importFieldKeySchema = z.enum([
  // clientes
  "name",
  "whatsapp",
  "email",
  "birthDate",
  "notes",
  // serviços
  "serviceName",
  "description",
  "price",
  "durationMinutes",
  "category",
  // agendamentos
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
  // horários (profissional e estabelecimento)
  "dayOfWeek",
  "startTime",
  "endTime",
  "pauseStart",
  "pauseEnd",
  "isOpen",
  // folgas e bloqueios
  "startDate",
  "endDate",
  "timeOffReason",
  "timeOffStatus",
  // produtos e estoque
  "productName",
  "productSku",
  "productBarcode",
  "productCategory",
  "productDescription",
  "productUnit",
  "productUnitLabel",
  "productType",
  "salePrice",
  "costPrice",
  "stockQty",
  "minStock",
  "productImage",
  // catálogo de pacotes
  "packageName",
  "sessionCount",
  "packagePrice",
  "validityDays",
  // saldo de pacotes do cliente
  "totalSessions",
  "remainingSessions",
  "pricePaid",
  "purchasedAt",
  "expiresAt",
  // fiado
  "customerName",
  "fiadoDescription",
  "originalAmount",
  "paidAmount",
  "dueDate",
]);

/** Tipos de alvo aceitos. */
export const importTargetSchema = z.enum([
  "CLIENTS",
  "SERVICES",
  "APPOINTMENTS",
  "STAFF_SCHEDULES",
  "SHOP_SCHEDULE",
  "TIME_OFF",
  "PRODUCTS",
  "SERVICE_PACKAGES",
  "CLIENT_PACKAGES",
  "FIADOS",
]);

export const importBatchParamsSchema = z.object({
  barbershopId: z.string().uuid(),
  batchId: z.string().uuid(),
});

export const targetQuerySchema = z.object({
  target: importTargetSchema.default("CLIENTS"),
});

export const importOptionsSchema = z.object({
  updateExisting: z.boolean().optional(),
  countFinancialValues: z.boolean().optional(),
  sendReviewInvitations: z.boolean().optional(),
  includeCase: z.boolean().optional(),
  /** Substitui o horário já configurado do dia. */
  replaceExistingSchedules: z.boolean().optional(),
  /** Importa a folga como pendente de aprovação. */
  importTimeOffAsPending: z.boolean().optional(),
  /** Atualiza preço e estoque mínimo de produto que já existe. */
  updateExistingProducts: z.boolean().optional(),
  /** Cria a categoria de produto que ainda não existe. */
  createProductCategories: z.boolean().optional(),
  /** Envia o lembrete de cobrança do fiado importado. */
  sendFiadoReminders: z.boolean().optional(),
});

const columnsSchema = z.record(z.string().regex(/^\d+$/), importFieldKeySchema);

/** Uma aba escolhida na etapa de alvo (só tipo; colunas são detectadas). */
const configureSheetSchema = z.object({
  sheetName: z.string().max(120).nullable().optional(),
  targetType: importTargetSchema,
});

/** Uma aba do plano multi-aba (com mapeamento de colunas). */
const importSheetSchema = z.object({
  sheetName: z.string().max(120).nullable().optional(),
  targetType: importTargetSchema,
  columns: columnsSchema,
  options: importOptionsSchema.optional(),
});

export const configureTargetSchema = z.union([
  // forma multi-aba
  z.object({
    sheets: z.array(configureSheetSchema).min(1),
  }),
  // forma legada (aba única)
  z.object({
    targetType: importTargetSchema,
    sheetName: z.string().max(120).nullable().optional(),
  }),
]);

export const mappingSchema = z.union([
  // forma multi-aba
  z.object({
    sheets: z.array(importSheetSchema).min(1),
  }),
  // forma legada (aba única)
  z.object({
    columns: columnsSchema,
    options: importOptionsSchema.optional(),
  }),
]);

export const confirmImportSchema = z.object({}).passthrough();
