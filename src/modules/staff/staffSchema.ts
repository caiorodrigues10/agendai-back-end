import { z } from "zod";

const timeOffStatusEnum = z.enum(["PENDING", "APPROVED", "REJECTED"]);

export const upsertScheduleSchema = z.object({
  staffId: z.string().uuid(),
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  isActive: z.boolean().default(true),
});

export const deleteScheduleSchema = z.object({
  staffId: z.string().uuid(),
  scheduleId: z.string().uuid(),
});

export const assignServiceSchema = z.object({
  staffId: z.string().uuid(),
  serviceId: z.string().uuid(),
  customPrice: z.number().min(0).optional().nullable(),
  customTime: z.number().int().min(0).optional().nullable(),
  isActive: z.boolean().default(true),
});

export const removeServiceSchema = z.object({
  staffId: z.string().uuid(),
  serviceId: z.string().uuid(),
});

export const requestTimeOffSchema = z.object({
  staffId: z.string().uuid(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  reason: z.string().max(500).optional().nullable(),
});

export const timeOffQuerySchema = z.object({
  staffId: z.string().uuid().optional(),
  status: timeOffStatusEnum.optional(),
});
