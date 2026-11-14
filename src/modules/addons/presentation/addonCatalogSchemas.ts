import { z } from "zod";

export const createSalonAddonSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(5000).nullish(),
  price: z.number().min(0).max(100_000),
  durationMinutes: z.number().int().min(0).max(24 * 60).default(0),
  active: z.boolean().default(true),
  availableOnline: z.boolean().default(true),
  maxQuantity: z.number().int().min(1).max(100).default(10),
  commissionable: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0),
});

export const updateSalonAddonSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(5000).nullish(),
  price: z.number().min(0).max(100_000).optional(),
  durationMinutes: z.number().int().min(0).max(24 * 60).optional(),
  active: z.boolean().optional(),
  availableOnline: z.boolean().optional(),
  maxQuantity: z.number().int().min(1).max(100).optional(),
  commissionable: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const listSalonAddonsQuerySchema = z.object({
  serviceId: z.string().uuid().optional(),
  includeDeleted: z.coerce.boolean().optional(),
});

export const serviceAddonLinkItemSchema = z.object({
  addonId: z.string().uuid(),
  priceOverride: z.number().min(0).max(100_000).nullish(),
  timeOverride: z.number().int().min(0).max(24 * 60).nullish(),
  sortOrder: z.number().int().min(0).optional(),
});

export const replaceServiceAddonLinksSchema = z.object({
  links: z.array(serviceAddonLinkItemSchema).max(100),
});

export type CreateSalonAddonBody = z.infer<typeof createSalonAddonSchema>;
export type UpdateSalonAddonBody = z.infer<typeof updateSalonAddonSchema>;
export type ReplaceServiceAddonLinksBody = z.infer<typeof replaceServiceAddonLinksSchema>;
