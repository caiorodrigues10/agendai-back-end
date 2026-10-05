import { z } from "zod";

export const salonParamsSchema = z.object({ salonId: z.string().uuid() });
export const socialPostParamsSchema = salonParamsSchema.extend({ postId: z.string().uuid() });
export const commentParamsSchema = socialPostParamsSchema.extend({ commentId: z.string().uuid() });
export const tagParamsSchema = salonParamsSchema.extend({ tagId: z.string().uuid() });
export const commentSchema = z.object({ content: z.string().trim().min(1).max(500) }).strict();
export const commentQuerySchema = z.object({ page: z.coerce.number().int().min(1).max(10000).default(1) });
export const tagSchema = z.object({ targetBarbershopId: z.string().uuid() }).strict();
export const moderateTagSchema = z.object({ approve: z.boolean() }).strict();
export const taggedQuerySchema = z.object({ pending: z.enum(["true", "false"]).default("false") });
