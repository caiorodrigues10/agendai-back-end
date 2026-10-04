import { z } from "zod";

const userRoleEnum = z.enum(["MASTER_ADMIN", "OWNER", "EMPLOYEE"]);

const searchQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(10),
  search: z.string().max(100).optional(),
}).strict();

export const adminListUsersQuerySchema = searchQuerySchema.extend({
  role: userRoleEnum.optional(),
  active: z.enum(["true", "false"]).optional(),
  barbershopId: z.string().uuid().optional(),
}).strict();

export const adminListBarbershopsQuerySchema = searchQuerySchema.extend({
  status: z.enum(["active", "inactive"]).optional(),
}).strict();

export const adminListBlockedEntitiesQuerySchema = searchQuerySchema.extend({
  type: z.string().max(50).optional(),
  isActive: z.enum(["true", "false"]).optional(),
}).strict();

export const adminListSubscriptionsQuerySchema = searchQuerySchema.extend({
  status: z.string().max(30).optional(),
}).strict();

export const adminCreateUserSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
  password: z.string().min(6).optional(),
  role: userRoleEnum,
  barbershopId: z.string().uuid().nullable().optional(),
  active: z.boolean().optional().default(true),
  cpf: z.string().nullable().optional(),
}).strict();

export const adminUpdateUserSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().optional(),
  role: userRoleEnum.optional(),
  active: z.boolean().optional(),
  barbershopId: z.string().uuid().nullable().optional(),
  cpf: z.string().nullable().optional(),
}).strict();

export const adminUpdateBarbershopStatusSchema = z.object({
  active: z.boolean().optional(),
  approvalStatus: z.enum(["APPROVED", "REJECTED", "PENDING"]).optional(),
  rejectionReason: z.string().max(500).optional(),
}).strict();

export const adminCreateBarbershopSchema = z.object({
  name: z.string().min(1).max(200),
  whatsapp: z.string().min(1).max(20),
  cnpj: z.string().nullable().optional(),
  address: z.string().max(500).optional(),
  active: z.boolean().optional().default(true),
}).strict();

/** Motivo obrigatório de toda revogação de sessão (auditoria + diálogo). */
export const sessionReasonSchema = z
  .string()
  .trim()
  .min(10, "Informe um motivo com pelo menos 10 caracteres")
  .max(500);

export const adminSessionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  userId: z.string().uuid().optional(),
  status: z.enum(["active", "revoked", "expired"]).optional(),
}).strict();

export const adminRevokeSessionSchema = z.object({
  reason: sessionReasonSchema,
  /** Exigido ao encerrar a sessão ATUAL do próprio admin. */
  confirmSelf: z.boolean().optional(),
}).strict();

export const adminRevokeUserSessionsSchema = z.object({
  reason: sessionReasonSchema,
  /** Exigido quando o alvo é o próprio admin (mata a sessão atual dele). */
  confirmSelf: z.boolean().optional(),
}).strict();
