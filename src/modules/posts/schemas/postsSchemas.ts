import { z } from "zod";
import { isValidPaletteKey } from "../services/postPalettes";

/** Modos do CTA (minúsculos, front) ↔ enum Prisma PostMode (maiúsculos). */
export const POST_MODE_MAP = {
  queue: "QUEUE",
  appointments: "APPOINTMENTS",
  both: "BOTH",
} as const;

/** Status (minúsculos, front) ↔ enum Prisma FeedPostStatus (maiúsculos). */
export const POST_STATUS_MAP = {
  draft: "DRAFT",
  scheduled: "SCHEDULED",
  published: "PUBLISHED",
} as const;

export type PostModeInput = keyof typeof POST_MODE_MAP;

export const postModeSchema = z.enum(["queue", "appointments", "both"]);
export const postTypeSchema = z.enum(["haircut", "beard", "announcement"]);
export const postFormatSchema = z.enum(["square", "portrait", "story"]);
export const templateKeySchema = z.string().regex(/^[a-z0-9-]{3,64}$/);
export const designOptionsSchema = z.object({
  focalX: z.number().min(0).max(100).optional(),
  focalY: z.number().min(0).max(100).optional(),
  overlay: z.number().min(0).max(100).optional(),
}).optional();

/** Paleta validada contra o catálogo `postPalettes` (sem seletor livre). */
export const paletteKeySchema = z
  .string()
  .regex(/^[a-z0-9-]{2,32}$/)
  .refine(isValidPaletteKey, { message: "Paleta não suportada" });

export const previewPostQuerySchema = z.object({
  barbershopId: z.string().uuid(),
  postMode: postModeSchema.default("both"),
  type: postTypeSchema.default("announcement"),
  title: z.string().max(80).optional(),
  ctaText: z.string().max(40).optional(),
  templateKey: templateKeySchema.default("agenda-aberta"),
  format: postFormatSchema.default("square"),
  primaryMediaId: z.string().uuid().optional().nullable(),
  secondaryMediaId: z.string().uuid().optional().nullable(),
  paletteKey: paletteKeySchema.default("brand"),
  designOptions: designOptionsSchema,
});

/** status "draft" salva rascunho; "scheduled" exige scheduledFor futuro. */
export const createPostSchema = z.object({
  barbershopId: z.string().uuid(),
  type: postTypeSchema,
  title: z.string().max(200).optional().nullable(),
  content: z.string().max(5000).optional().default(""),
  ctaText: z.string().max(120).optional().nullable(),
  templateKey: templateKeySchema.optional(),
  format: postFormatSchema.optional(),
  primaryMediaId: z.string().uuid().optional().nullable(),
  secondaryMediaId: z.string().uuid().optional().nullable(),
  paletteKey: paletteKeySchema.optional(),
  designOptions: designOptionsSchema,
  postMode: postModeSchema.optional().default("both"),
  scheduledFor: z.string().datetime().optional().nullable(),
  status: z.enum(["draft"]).optional(),
});

/** Edição de conteúdo/mídia/visual. Transições de status ficam nas rotas de ação. */
export const updatePostSchema = z.object({
  title: z.string().max(200).optional().nullable(),
  ctaText: z.string().max(120).optional().nullable(),
  content: z.string().max(5000).optional(),
  postMode: postModeSchema.optional(),
  templateKey: templateKeySchema.optional(),
  format: postFormatSchema.optional(),
  paletteKey: paletteKeySchema.optional(),
  primaryMediaId: z.string().uuid().optional().nullable(),
  secondaryMediaId: z.string().uuid().optional().nullable(),
  designOptions: designOptionsSchema,
});

export const schedulePostSchema = z.object({
  scheduledFor: z.string().datetime(),
});

export const listPostsQuerySchema = z.object({
  barbershopId: z.string().uuid(),
  status: z.enum(["draft", "scheduled", "published"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
});

export const listScheduledQuerySchema = z.object({
  barbershopId: z.string().uuid(),
});

export const getConfigQuerySchema = z.object({
  barbershopId: z.string().uuid(),
});

export const saveConfigBodySchema = z.object({
  barbershopId: z.string().uuid(),
  autoPostEnabled: z.boolean(),
});

export const generatePostSchema = z.object({
  barbershopId: z.string().uuid(),
  type: postTypeSchema,
  postMode: postModeSchema.default("both"),
  tone: z.enum(["promocional", "informativo", "divertido"]).optional(),
  extra: z.string().max(500).optional(),
  count: z.number().int().min(1).max(5).optional(),
});

export const postParamsSchema = z.object({
  id: z.string().uuid(),
});
