import { z } from "zod";

/**
 * Número de processo no padrão CNJ: NNNNNNN-DD.AAAA.J.TR.OOOO.
 *
 * Aceita o formato canônico e a versão sem os pontos (facilitando colar de
 * outra fonte); a versão gravada é sempre a canônica. Vazio é aceito — o
 * número do processo é opcional.
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

const caseNumberSchema = z
  .string()
  .trim()
  .max(30, "Número de processo muito longo")
  .transform(normalizeCaseNumber)
  .refine((value) => value === "" || CNJ_CANONICAL.test(value), {
    message: "Número de processo inválido (use NNNNNNN-DD.AAAA.J.TR.OOOO)",
  });

export const caseStatusSchema = z.enum([
  "LEAD",
  "ACTIVE",
  "AWAITING_CLIENT",
  "IN_COURT",
  "SUSPENDED",
  "CLOSED",
  "ARCHIVED",
]);

export const casePrioritySchema = z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]);

export const createCaseSchema = z.object({
  nickname: z.string().min(1, "Apelido obrigatório").max(120),
  practiceArea: z.string().min(1).max(80).nullable().optional(),
  caseNumber: caseNumberSchema.nullable().optional(),
  notes: z.string().max(500, "Observação muito longa").nullable().optional(),
  status: caseStatusSchema.optional(),
  priority: casePrioritySchema.optional(),
  title: z.string().min(1).max(160).nullable().optional(),
  courtName: z.string().min(1).max(120).nullable().optional(),
  opponent: z.string().min(1).max(120).nullable().optional(),
  claimedAmount: z.coerce.number().min(0).max(1_000_000_000).nullable().optional(),
  awardedAmount: z.coerce.number().min(0).max(1_000_000_000).nullable().optional(),
  responsibleStaffId: z.string().uuid().nullable().optional(),
  /** Compartilha o caso com o cliente no portal. */
  shareWithClient: z.coerce.boolean().optional(),
});

export const updateCaseSchema = z.object({
  nickname: z.string().min(1).max(120).optional(),
  practiceArea: z.string().min(1).max(80).nullable().optional(),
  caseNumber: caseNumberSchema.nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  active: z.boolean().optional(),
  status: caseStatusSchema.optional(),
  priority: casePrioritySchema.optional(),
  title: z.string().min(1).max(160).nullable().optional(),
  courtName: z.string().min(1).max(120).nullable().optional(),
  opponent: z.string().min(1).max(120).nullable().optional(),
  claimedAmount: z.coerce.number().min(0).max(1_000_000_000).nullable().optional(),
  awardedAmount: z.coerce.number().min(0).max(1_000_000_000).nullable().optional(),
  responsibleStaffId: z.string().uuid().nullable().optional(),
  /** Compartilha o caso com o cliente no portal. */
  shareWithClient: z.coerce.boolean().optional(),
});

export type CreateCaseInput = z.infer<typeof createCaseSchema>;
export type UpdateCaseInput = z.infer<typeof updateCaseSchema>;
