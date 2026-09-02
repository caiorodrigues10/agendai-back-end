import { z } from "zod";

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
  paletteKey: z.string().regex(/^[a-z0-9-]{2,32}$/).default("brand"),
  designOptions: designOptionsSchema,
});

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
  paletteKey: z.string().regex(/^[a-z0-9-]{2,32}$/).optional(),
  designOptions: designOptionsSchema,
  postMode: postModeSchema.optional().default("both"),
  scheduledFor: z.string().datetime().optional().nullable(),
});

export const updatePostSchema = z.object({
  title: z.string().max(200).optional().nullable(),
  ctaText: z.string().max(120).optional().nullable(),
  postMode: postModeSchema.optional(),
  scheduledFor: z.string().datetime().optional().nullable(),
  status: z.enum(["published"]).optional(),
  templateKey: templateKeySchema.optional(),
  format: postFormatSchema.optional(),
  paletteKey: z.string().regex(/^[a-z0-9-]{2,32}$/).optional(),
  designOptions: designOptionsSchema,
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
