import { z } from "zod";

/**
 * Schemas de entrada da gestão de processos (segmento LAW_FIRM).
 *
 * Regras de formato compartilhadas com o CRUD de casos (`clients/caseSchemas`):
 * número CNJ canônico e área de atuação como texto livre.
 */

// O segmento do tribunal (TR) aparece em letras ("8.SP") ou em dígitos
// ("8.26", formato oficial do CNJ) — ambos são aceitos.
const CNJ_CANONICAL = /^\d{7}-\d{2}\.\d{4}\.\d\.([A-Z]{2}|\d{2})\.\d{4}$/;
const CNJ_WITHOUT_DOTS = /^(\d{7})-(\d{2})(\d{4})(\d)([A-Za-z]{2}|\d{2})(\d{4})$/;

export function normalizeCaseNumber(value: string): string {
  const raw = value.trim().toUpperCase();
  if (CNJ_CANONICAL.test(raw)) return raw;
  const match = CNJ_WITHOUT_DOTS.exec(raw);
  if (!match) return raw;
  const [, seq, branch, year, jurisdiction, tribunal, origin] = match;
  return `${seq}-${branch}.${year}.${jurisdiction}.${tribunal}.${origin}`;
}

export const caseNumberSchema = z
  .string()
  .trim()
  .max(30, "Número de processo muito longo")
  .transform(normalizeCaseNumber)
  .refine((value) => value === "" || CNJ_CANONICAL.test(value), {
    message: "Número de processo inválido (use NNNNNNN-DD.AAAA.J.TR.OOOO)",
  });

export const casePrioritySchema = z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]);
export const caseStatusSchema = z.enum([
  "LEAD",
  "ACTIVE",
  "AWAITING_CLIENT",
  "IN_COURT",
  "SUSPENDED",
  "CLOSED",
  "ARCHIVED",
]);

/** Lista de casos do escritório. */
export const listCasesQuerySchema = z.object({
  status: caseStatusSchema.optional(),
  priority: casePrioritySchema.optional(),
  practiceArea: z.string().trim().max(80).optional(),
  clientId: z.string().uuid().optional(),
  responsibleStaffId: z.string().uuid().optional(),
  /** Texto livre: apelido, título, número do processo ou nome do cliente. */
  q: z.string().trim().max(120).optional(),
  includeArchived: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

/** Tarefa do caso. */
export const createCaseTaskSchema = z.object({
  title: z.string().trim().min(1, "Título obrigatório").max(160),
  description: z.string().trim().max(2000).nullable().optional(),
  status: z.enum(["OPEN", "DONE", "CANCELED"]).optional(),
  priority: casePrioritySchema.optional(),
  dueDate: z.coerce.date().nullable().optional(),
  assigneeStaffId: z.string().uuid().nullable().optional(),
});

export const updateCaseTaskSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  status: z.enum(["OPEN", "DONE", "CANCELED"]).optional(),
  priority: casePrioritySchema.optional(),
  dueDate: z.coerce.date().nullable().optional(),
  assigneeStaffId: z.string().uuid().nullable().optional(),
});

/** Prazo do caso ou do escritório. */
export const createDeadlineSchema = z.object({
  title: z.string().trim().min(1, "Título obrigatório").max(160),
  type: z
    .enum(["JUDICIAL_RESPONSE", "HEARING", "APPEAL", "CONTRACTUAL", "INTERNAL"])
    .optional(),
  status: z.enum(["PENDING", "FULFILLED", "MISSED", "CANCELED"]).optional(),
  /** Data final do prazo (YYYY-MM-DD). */
  dueDate: z.coerce.date().optional(),
  /**
   * Contagem em dias úteis a partir de `referenceDate` (ou de hoje).
   * Quando enviado, o prazo é calculado automaticamente.
   */
  businessDays: z.coerce.number().int().min(1).max(3650).optional(),
  referenceDate: z.coerce.date().optional(),
  courtName: z.string().trim().max(120).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export const updateDeadlineSchema = createDeadlineSchema.partial();

/** Prazos do escritório (calendário). */
export const listDeadlinesQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  status: z.enum(["PENDING", "FULFILLED", "MISSED", "CANCELED"]).optional(),
  caseId: z.string().uuid().optional(),
  /** Prazo em dias úteis a partir de hoje (ex.: 7 = próxima semana). */
  withinBusinessDays: z.coerce.number().int().min(1).max(365).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

/** Andamento do caso. */
export const createCaseEventSchema = z.object({
  type: z
    .enum([
      "NOTE",
      "MEETING",
      "FILING",
      "COURT_MOTION",
      "DEADLINE",
      "INTIMATION",
      "PAYMENT",
      "CLIENT_CONTACT",
    ])
    .optional(),
  title: z.string().trim().min(1, "Título obrigatório").max(160),
  description: z.string().trim().max(4000).nullable().optional(),
  occurredAt: z.coerce.date().optional(),
  /** Compartilha o andamento com o cliente no portal (padrão: não). */
  visibleToClient: z.coerce.boolean().optional(),
});

/** Documento do caso. */
export const createCaseDocumentSchema = z.object({
  title: z.string().trim().min(1, "Título obrigatório").max(160),
  type: z
    .enum([
      "CONTRACT",
      "PROCURACAO",
      "PETITION",
      "EVIDENCE",
      "COURT_DOCUMENT",
      "INTAKE",
      "RECEIPT",
      "OTHER",
    ])
    .optional(),
  fileUrl: z.string().trim().url("Link do arquivo inválido").max(500).nullable().optional(),
  fileName: z.string().trim().max(200).nullable().optional(),
  mimeType: z.string().trim().max(120).nullable().optional(),
  sizeBytes: z.coerce.number().int().min(0).max(1024 * 1024 * 1024).nullable().optional(),
  version: z.coerce.number().int().min(1).max(999).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

/** Feriado/suspensão do escritório. */
export const createOfficeHolidaySchema = z.object({
  date: z.coerce.date(),
  name: z.string().trim().min(1, "Nome obrigatório").max(120),
});

export const listOfficeHolidaysQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

/** `z.input`: o controller aplica os defaults do schema antes do use case. */
export type ListCasesQuery = z.input<typeof listCasesQuerySchema>;
export type CreateCaseTaskInput = z.infer<typeof createCaseTaskSchema>;
export type UpdateCaseTaskInput = z.infer<typeof updateCaseTaskSchema>;
export type CreateDeadlineInput = z.infer<typeof createDeadlineSchema>;
export type UpdateDeadlineInput = z.infer<typeof updateDeadlineSchema>;
export type ListDeadlinesQuery = z.input<typeof listDeadlinesQuerySchema>;
export type CreateCaseEventInput = z.infer<typeof createCaseEventSchema>;
export type CreateCaseDocumentInput = z.infer<typeof createCaseDocumentSchema>;
export type CreateOfficeHolidayInput = z.infer<typeof createOfficeHolidaySchema>;
