import { z } from "zod";

export const createServiceCategorySchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional().nullable(),
  icon: z.string().max(50).optional().nullable(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Cor deve ser hex válido ex: #FF5733").optional().nullable(),
});

export const updateServiceCategorySchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  icon: z.string().max(50).optional().nullable(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().nullable(),
  active: z.boolean().optional(),
});

export const createExpenseCategorySchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional().nullable(),
  icon: z.string().max(50).optional().nullable(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Cor deve ser hex válido ex: #FF5733").optional().nullable(),
});

export const updateExpenseCategorySchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  icon: z.string().max(50).optional().nullable(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().nullable(),
  active: z.boolean().optional(),
});