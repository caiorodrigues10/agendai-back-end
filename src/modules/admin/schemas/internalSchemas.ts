import { z } from "zod";

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
  search: z.string().max(100).optional(),
}).strict();

// ── Team ──────────────────────────────────────────────────────────────────────

export const inviteTeamMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(["MASTER_ADMIN"]).optional().default("MASTER_ADMIN"),
}).strict();

export const updateMemberStatusSchema = z.object({
  active: z.boolean(),
}).strict();

export const acceptInvitationSchema = z.object({
  token: z.string().min(32),
  name: z.string().min(1).max(200),
  password: z.string().min(6),
}).strict();

export const invitationQuerySchema = z.object({
  status: z.enum(["PENDING", "ACCEPTED", "EXPIRED", "REVOKED"]).optional(),
}).strict();

// ── Tickets ───────────────────────────────────────────────────────────────────

export const createTicketSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(5000),
  barbershopId: z.string().uuid().nullable().optional(),
  channel: z.enum(["WHATSAPP", "EMAIL", "PHONE", "IN_APP", "OTHER"]).optional().default("OTHER"),
  category: z.enum(["ACCESS", "BILLING", "SCHEDULE", "ERROR", "QUESTION", "SUGGESTION", "FEEDBACK"]).optional().default("QUESTION"),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional().default("NORMAL"),
}).strict();

export const updateTicketSchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "WAITING_SHOP", "RESOLVED", "CANCELLED"]).optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
  assignedToId: z.string().uuid().nullable().optional(),
  category: z.enum(["ACCESS", "BILLING", "SCHEDULE", "ERROR", "QUESTION", "SUGGESTION", "FEEDBACK"]).optional(),
  cancelReason: z.string().max(500).optional(),
  resolveNote: z.string().max(500).optional(),
  version: z.number().int().min(1),
}).strict();

export const listTicketsQuerySchema = paginationSchema.extend({
  status: z.enum(["OPEN", "IN_PROGRESS", "WAITING_SHOP", "RESOLVED", "CANCELLED"]).optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
  assignedToId: z.string().uuid().optional(),
  barbershopId: z.string().uuid().optional(),
  channel: z.enum(["WHATSAPP", "EMAIL", "PHONE", "IN_APP", "OTHER"]).optional(),
  category: z.enum(["ACCESS", "BILLING", "SCHEDULE", "ERROR", "QUESTION", "SUGGESTION", "FEEDBACK"]).optional(),
  unassigned: z.literal("true").optional(),
}).strict();

export const createTicketCommentSchema = z.object({
  text: z.string().min(1).max(5000),
}).strict();

// ── Tasks ─────────────────────────────────────────────────────────────────────

export const createTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional().default("NORMAL"),
  assignedToId: z.string().uuid().nullable().optional(),
  dueDate: z.string().datetime().optional(),
  barbershopId: z.string().uuid().nullable().optional(),
  ticketId: z.string().uuid().nullable().optional(),
}).strict();

export const updateTaskSchema = z.object({
  status: z.enum(["TODO", "IN_PROGRESS", "BLOCKED", "DONE", "CANCELLED"]).optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
  assignedToId: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  reason: z.string().max(500).optional(),
  version: z.number().int().min(1),
}).strict();

export const listTasksQuerySchema = paginationSchema.extend({
  status: z.enum(["TODO", "IN_PROGRESS", "BLOCKED", "DONE", "CANCELLED"]).optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
  assignedToId: z.string().uuid().optional(),
  barbershopId: z.string().uuid().optional(),
  ticketId: z.string().uuid().optional(),
  dueBefore: z.string().datetime().optional(),
  dueAfter: z.string().datetime().optional(),
}).strict();

export const createTaskCommentSchema = z.object({
  text: z.string().min(1).max(5000),
}).strict();

// ── Work Summary ──────────────────────────────────────────────────────────────

export const workSummaryQuerySchema = z.object({}).strict();

// ── Audit (extended) ─────────────────────────────────────────────────────────

export const adminAuditLogQuerySchema = paginationSchema.extend({
  userId: z.string().uuid().optional(),
  action: z.string().max(100).optional(),
  resource: z.string().max(100).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
}).strict();
