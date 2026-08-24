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

export const previewPostQuerySchema = z.object({
  barbershopId: z.string().uuid(),
  postMode: postModeSchema.default("both"),
  type: postTypeSchema.default("announcement"),
});

export const createPostSchema = z.object({
  barbershopId: z.string().uuid(),
  type: postTypeSchema,
  title: z.string().max(200).optional().nullable(),
  content: z.string().max(5000).optional().default(""),
  ctaText: z.string().max(120).optional().nullable(),
  postMode: postModeSchema.optional().default("both"),
  scheduledFor: z.string().datetime().optional().nullable(),
});

export const updatePostSchema = z.object({
  title: z.string().max(200).optional().nullable(),
  ctaText: z.string().max(120).optional().nullable(),
  postMode: postModeSchema.optional(),
  scheduledFor: z.string().datetime().optional().nullable(),
  status: z.enum(["published"]).optional(),
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

export const postParamsSchema = z.object({
  id: z.string().uuid(),
});