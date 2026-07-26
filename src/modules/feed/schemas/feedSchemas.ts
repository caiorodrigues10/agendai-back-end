import { z } from "zod";

/** Tipos do front (minúsculos) ↔ enum Prisma FeedType (maiúsculos). */
export const FEED_TYPE_MAP = {
  haircut: "HAIRCUT",
  beard: "BEARD",
  announcement: "ANNOUNCEMENT",
} as const;

export type FeedTypeInput = keyof typeof FEED_TYPE_MAP;

export const createFeedPostSchema = z.object({
  barbershopId: z.string().uuid(),
  type: z.enum(["haircut", "beard", "announcement"]),
  title: z.string().max(200).optional().nullable(),
  content: z.string().max(5000).default(""),
  imageUrl: z.string().optional().nullable(),
});

export const updateFeedPostSchema = z.object({
  type: z.enum(["haircut", "beard", "announcement"]).optional(),
  title: z.string().max(200).optional().nullable(),
  content: z.string().max(5000).optional(),
  imageUrl: z.string().optional().nullable(),
  likes: z.number().int().min(0).optional(),
});

export const listFeedQuerySchema = z.object({
  barbershopId: z.string().uuid().optional(),
});
