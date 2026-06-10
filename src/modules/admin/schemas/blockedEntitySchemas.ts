import { z } from "zod";

export const blockSchema = z.object({
  type: z.enum(["CPF", "CNPJ"]),
  value: z.string().min(11).max(14),
  reason: z.string().min(5).max(500),
  barbershopId: z.string().uuid().optional()
});

export const unblockSchema = z.object({
  type: z.enum(["CPF", "CNPJ"]),
  value: z.string().min(11).max(14)
});

export type BlockInput = z.infer<typeof blockSchema>;
export type UnblockInput = z.infer<typeof unblockSchema>;