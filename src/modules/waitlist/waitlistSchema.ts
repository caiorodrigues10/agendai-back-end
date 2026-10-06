import { z } from "zod";
import { WaitlistStatus } from "@prisma/client";

export const createWaitlistEntrySchema = z.object({
  customerName: z.string().min(1).max(200),
  whatsapp: z.string().max(20).optional().nullable(),
  serviceId: z.string().uuid(),
  preferredStaffId: z.string().uuid().optional().nullable(),
  dateFrom: z.coerce.date(),
  dateTo: z.coerce.date(),
  preferredPeriods: z.array(z.string()).optional().default([]),
  flexibilityMinutes: z.number().min(0).max(120).default(0),
  priority: z.number().min(0).max(10).default(5),
});

export const updateWaitlistEntrySchema = z.object({
  status: z.nativeEnum(WaitlistStatus).optional(),
  priority: z.number().min(0).max(10).optional(),
});

export const createWaitlistOfferSchema = z.object({
  entryId: z.string().uuid(),
  offeredDate: z.coerce.date(),
  offeredTime: z.string().regex(/^\d{2}:\d{2}$/),
  staffId: z.string().uuid(),
});

export const publicCreateWaitlistEntrySchema = z.object({
  barbershopId: z.string().uuid(),
  customerName: z.string().min(1).max(200),
  whatsapp: z.string().max(20).optional().nullable(),
  serviceId: z.string().uuid(),
  dateFrom: z.coerce.date(),
  dateTo: z.coerce.date(),
  preferredPeriods: z.array(z.string()).optional().default([]),
  flexibilityMinutes: z.number().min(0).max(120).default(0),
});

export const waitlistEntryListQuerySchema = z.object({
  status: z.nativeEnum(WaitlistStatus).optional(),
  serviceId: z.string().uuid().optional(),
  page: z.coerce.number().min(1).default(1).optional(),
  limit: z.coerce.number().min(1).max(100).default(20).optional(),
});

export type CreateWaitlistEntryInput = z.infer<typeof createWaitlistEntrySchema>;
export type UpdateWaitlistEntryInput = z.infer<typeof updateWaitlistEntrySchema>;
export type CreateWaitlistOfferInput = z.infer<typeof createWaitlistOfferSchema>;
export type PublicCreateWaitlistEntryInput = z.infer<typeof publicCreateWaitlistEntrySchema>;
export type WaitlistEntryListQueryInput = z.infer<typeof waitlistEntryListQuerySchema>;
