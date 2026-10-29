import { z } from "zod";
import { caseNumberSchema, casePrioritySchema } from "./caseManagementSchemas";

/**
 * Schemas de entrada do backlog de gestão de processos:
 * contratos/assinaturas, timesheet, honorários de êxito, intimações (PJe),
 * NFS-e, alertas de prazo e transferência entre unidades.
 */

export const contractTypeSchema = z.enum([
  "ENGAGEMENT",
  "PROCURACAO",
  "SETTLEMENT",
  "FEE_AGREEMENT",
  "OTHER",
]);
export const contractStatusSchema = z.enum([
  "DRAFT",
  "SENT",
  "PARTIALLY_SIGNED",
  "SIGNED",
  "VOID",
]);
export const signatureRoleSchema = z.enum(["CLIENT", "LAWYER", "WITNESS"]);
export const signatureTypeSchema = z.enum(["DRAWN", "TYPED", "DIGITAL_CERT"]);

const signatureUrlSchema = z
  .string()
  .max(2_000_000, "Assinatura desenhada muito longa")
  .refine((v) => v.startsWith("data:image/") || v.startsWith("http"), {
    message: "Assinatura deve ser dataURL de imagem ou URL",
  });

/** Contrato/procuração do caso. */
export const createCaseContractSchema = z.object({
  title: z.string().trim().min(1, "Título obrigatório").max(160),
  type: contractTypeSchema.optional(),
  content: z.string().trim().max(20_000).nullable().optional(),
  value: z.coerce.number().nonnegative().max(10_000_000).nullable().optional(),
  feePercent: z.coerce
    .number()
    .min(0)
    .max(100, "Percentual entre 0 e 100")
    .nullable()
    .optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  /** Signatários iniciais (nome + contato). */
  signers: z
    .array(
      z.object({
        signerName: z.string().trim().min(1).max(120),
        signerEmail: z.string().email().nullable().optional(),
        signerWhatsapp: z.string().trim().max(20).nullable().optional(),
        role: signatureRoleSchema.optional(),
      })
    )
    .min(1, "Informe ao menos um signatário")
    .max(10)
    .optional(),
});

export const updateCaseContractSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  content: z.string().trim().max(20_000).nullable().optional(),
  value: z.coerce.number().nonnegative().max(10_000_000).nullable().optional(),
  feePercent: z.coerce.number().min(0).max(100).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  status: contractStatusSchema.optional(),
  fileUrl: z.string().trim().max(500).nullable().optional(),
  fileName: z.string().trim().max(200).nullable().optional(),
  mimeType: z.string().trim().max(120).nullable().optional(),
  sizeBytes: z.coerce.number().int().nonnegative().nullable().optional(),
});

export const sendContractForSignatureSchema = z.object({
  /** Mensagem enviada junto do link (opcional). */
  message: z.string().trim().max(500).nullable().optional(),
});

export const signContractSchema = z.object({
  /** Assinatura tipada: nome conforme documento. */
  typedName: z.string().trim().min(1, "Digite seu nome").max(120).optional(),
  /** Assinatura desenhada: dataURL PNG/JPEG. */
  drawnSignature: signatureUrlSchema.optional(),
}).refine((v) => Boolean(v.typedName || v.drawnSignature), {
  message: "Informe a assinatura digitada ou desenhada",
});

export const addContractSignerSchema = z.object({
  signerName: z.string().trim().min(1).max(120),
  signerEmail: z.string().email().nullable().optional(),
  signerWhatsapp: z.string().trim().max(20).nullable().optional(),
  role: signatureRoleSchema.optional(),
});

export const declineContractSchema = z.object({
  reason: z.string().trim().max(500).nullable().optional(),
});

/** Timesheet. */
export const createTimeEntrySchema = z.object({
  staffUserId: z.string().uuid("Responsável obrigatório"),
  description: z.string().trim().max(2000).nullable().optional(),
  minutes: z.coerce
    .number()
    .int("Minutos devem ser inteiros")
    .min(1, "Informe ao menos 1 minuto")
    .max(24 * 60, "Máximo 24h por lançamento"),
  billable: z.coerce.boolean().optional(),
  hourlyRate: z.coerce.number().nonnegative().max(1_000_000).nullable().optional(),
  entryDate: z.coerce.date().optional(),
});

export const updateTimeEntrySchema = z.object({
  description: z.string().trim().max(2000).nullable().optional(),
  minutes: z.coerce.number().int().min(1).max(24 * 60).optional(),
  billable: z.coerce.boolean().optional(),
  hourlyRate: z.coerce.number().nonnegative().max(1_000_000).nullable().optional(),
  billed: z.coerce.boolean().optional(),
  entryDate: z.coerce.date().optional(),
});

/** Honorário de êxito. */
export const createSuccessFeeSchema = z.object({
  percent: z.coerce
    .number()
    .min(0.01, "Percentual obrigatório")
    .max(100, "Percentual entre 0 e 100"),
  installments: z.coerce.number().int().min(1).max(120).optional(),
  dueDate: z.coerce.date().nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export const updateSuccessFeeSchema = z.object({
  percent: z.coerce.number().min(0.01).max(100).optional(),
  installments: z.coerce.number().int().min(1).max(120).optional(),
  status: z.enum(["PENDING", "INVOICED", "PAID", "CANCELED"]).optional(),
  dueDate: z.coerce.date().nullable().optional(),
  paidAt: z.coerce.date().nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

/** Digestão de intimações (PJe/tribunal/email/WhatsApp). */
export const createIntimationSchema = z.object({
  subject: z.string().trim().min(1, "Assunto obrigatório").max(300),
  body: z.string().trim().min(1, "Corpo obrigatório").max(20_000),
  source: z.enum(["EMAIL", "WHATSAPP", "MANUAL", "IMPORT"]).optional(),
  receivedAt: z.coerce.date().optional(),
  detectedNumber: caseNumberSchema.nullable().optional(),
});

/** Importação em lote (colado do PJe / CSV simples). */
export const importIntimationsSchema = z.object({
  /** Texto colado: linhas separadas por quebra simples. */
  text: z.string().trim().min(1, "Texto obrigatório").max(200_000),
  source: z.enum(["EMAIL", "WHATSAPP", "MANUAL", "IMPORT"]).optional(),
});

export const triageIntimationSchema = z.object({
  status: z.enum(["NEW", "TRIAGED", "LINKED", "IGNORED"]).optional(),
  caseId: z.string().uuid().nullable().optional(),
  suggestedType: z
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
  /** Se true, gera um andamento no caso ao vincular. */
  createEvent: z.coerce.boolean().optional(),
  /** Título do andamento gerado (padrão: subject da intimação). */
  eventTitle: z.string().trim().max(160).optional(),
  /** Compartilhar o andamento gerado com o cliente no portal. */
  visibleToClient: z.coerce.boolean().optional(),
});

/** NFS-e. */
export const createFeeInvoiceSchema = z.object({
  caseId: z.string().uuid().nullable().optional(),
  clientId: z.string().uuid().nullable().optional(),
  description: z.string().trim().min(1, "Descrição obrigatória").max(300),
  amount: z.coerce
    .number()
    .positive("Valor deve ser positivo")
    .max(10_000_000),
  issRetained: z.coerce.boolean().optional(),
  taxpayerId: z
    .string()
    .trim()
    .regex(/^(\d{11}|\d{14})$/, "Informe CPF (11) ou CNPJ (14) sem pontuação")
    .nullable()
    .optional(),
  provider: z.enum(["MANUAL", "NFE_IO", "FOCUS"]).optional(),
  invoiceNumber: z.string().trim().max(40).nullable().optional(),
});

export const issueFeeInvoiceSchema = z.object({
  /** Número da NFS-e (obrigatório para provider MANUAL). */
  invoiceNumber: z.string().trim().min(1).max(40).optional(),
  xmlUrl: z.string().trim().max(500).nullable().optional(),
});

export const updateFeeInvoiceSchema = z.object({
  description: z.string().trim().min(1).max(300).optional(),
  amount: z.coerce.number().positive().max(10_000_000).optional(),
  invoiceNumber: z.string().trim().max(40).nullable().optional(),
  status: z.enum(["DRAFT", "ISSUED", "CANCELED", "FAILED"]).optional(),
  issRetained: z.coerce.boolean().optional(),
  taxpayerId: z.string().trim().max(20).nullable().optional(),
});

/** Alertas de prazo (consulta; a geração é o cron). */
export const listDeadlineAlertsQuerySchema = z.object({
  status: z.enum(["PENDING", "SENT", "FAILED", "CANCELED"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

/** Transferência entre unidades. */
export const createTransferSchema = z.object({
  targetBarbershopId: z.string().uuid("Informe a unidade de destino"),
  reason: z.string().trim().max(1000).nullable().optional(),
});

export const respondTransferSchema = z.object({
  decision: z.enum(["ACCEPTED", "REJECTED"]),
  reason: z.string().trim().max(1000).nullable().optional(),
});

/** Configuração de alerta por prazo (manual). */
export const createDeadlineAlertSchema = z.object({
  userId: z.string().uuid("Destinatário obrigatório"),
  channel: z.enum(["WHATSAPP", "EMAIL"]).optional(),
  kind: z.enum(["UPCOMING", "OVERDUE"]).optional(),
  sentOn: z.coerce.date().optional(),
});

/** Portal do cliente — consulta. */
export const portalCasesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type CreateCaseContractInput = z.infer<typeof createCaseContractSchema>;
export type UpdateCaseContractInput = z.infer<typeof updateCaseContractSchema>;
export type SendContractForSignatureInput = z.infer<
  typeof sendContractForSignatureSchema
>;
export type SignContractInput = z.infer<typeof signContractSchema>;
export type AddContractSignerInput = z.infer<typeof addContractSignerSchema>;
export type DeclineContractInput = z.infer<typeof declineContractSchema>;
export type CreateTimeEntryInput = z.infer<typeof createTimeEntrySchema>;
export type UpdateTimeEntryInput = z.infer<typeof updateTimeEntrySchema>;
export type CreateSuccessFeeInput = z.infer<typeof createSuccessFeeSchema>;
export type UpdateSuccessFeeInput = z.infer<typeof updateSuccessFeeSchema>;
export type CreateIntimationInput = z.infer<typeof createIntimationSchema>;
export type ImportIntimationsInput = z.infer<typeof importIntimationsSchema>;
export type TriageIntimationInput = z.infer<typeof triageIntimationSchema>;
export type CreateFeeInvoiceInput = z.infer<typeof createFeeInvoiceSchema>;
export type IssueFeeInvoiceInput = z.infer<typeof issueFeeInvoiceSchema>;
export type UpdateFeeInvoiceInput = z.infer<typeof updateFeeInvoiceSchema>;
export type ListDeadlineAlertsQuery = z.infer<typeof listDeadlineAlertsQuerySchema>;
export type CreateTransferInput = z.infer<typeof createTransferSchema>;
export type RespondTransferInput = z.infer<typeof respondTransferSchema>;
export type CreateDeadlineAlertInput = z.infer<typeof createDeadlineAlertSchema>;

export type { z };
