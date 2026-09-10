import { z } from "zod";

const formTypeEnum = z.enum(["INTAKE", "AFTERCARE", "FEEDBACK", "CUSTOM"]);
const formFieldTypeEnum = z.enum(["TEXT", "TEXTAREA", "NUMBER", "SELECT", "DATE", "BOOLEAN"]);

export const createFormSchema = z.object({
  barbershopId: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().max(5000).optional().nullable(),
  type: formTypeEnum.default("INTAKE"),
});

export const updateFormSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional().nullable(),
  type: formTypeEnum.optional(),
  isActive: z.boolean().optional(),
});

export const addFieldSchema = z.object({
  label: z.string().min(1).max(200),
  type: formFieldTypeEnum.default("TEXT"),
  required: z.boolean().default(false),
  options: z.any().optional().nullable(),
  placeholder: z.string().max(200).optional().nullable(),
  order: z.number().int().min(0).optional(),
});

export const updateFieldSchema = z.object({
  label: z.string().min(1).max(200).optional(),
  type: formFieldTypeEnum.optional(),
  required: z.boolean().optional(),
  options: z.any().optional().nullable(),
  placeholder: z.string().max(200).optional().nullable(),
  order: z.number().int().min(0).optional(),
});

export const submitResponseSchema = z.object({
  clientId: z.string().uuid().optional().nullable(),
  appointmentId: z.string().uuid().optional().nullable(),
  answers: z.record(z.any()),
});

export const formListQuerySchema = z.object({
  isActive: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
});

export const formResponseListQuerySchema = z.object({
  clientId: z.string().uuid().optional(),
});
