import { z } from "zod";

export const createProtocolSchema = z.object({
  barbershopId: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  category: z.string().max(100).optional().nullable(),
  checklistItems: z.array(z.object({
    title: z.string().min(1).max(200),
    description: z.string().max(500).optional().nullable(),
    required: z.boolean().default(true),
  })).default([]),
});

export const updateProtocolSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  category: z.string().max(100).optional().nullable(),
  checklistItems: z.array(z.object({
    title: z.string().min(1).max(200),
    description: z.string().max(500).optional().nullable(),
    required: z.boolean().default(true),
  })).optional(),
  isActive: z.boolean().optional(),
});

export const runAuditSchema = z.object({
  protocolId: z.string().uuid(),
  barbershopId: z.string().uuid(),
  auditedById: z.string().uuid().optional().nullable(),
  staffId: z.string().uuid().optional().nullable(),
  results: z.array(z.object({
    checklistIndex: z.number().int().min(0),
    passed: z.boolean(),
    note: z.string().max(500).optional().nullable(),
  })),
  notes: z.string().max(2000).optional().nullable(),
});

export const qualityOverviewQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});
