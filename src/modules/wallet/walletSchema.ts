import { z } from "zod";

export const creditWalletSchema = z.object({
  amount: z.number().positive(),
  description: z.string().max(300).optional(),
  referenceId: z.string().uuid().optional(),
});

export const debitWalletSchema = z.object({
  amount: z.number().positive(),
  description: z.string().max(300).optional(),
  referenceId: z.string().uuid().optional(),
});

export const transferWalletSchema = z.object({
  targetWalletId: z.string().uuid(),
  amount: z.number().positive(),
  description: z.string().max(300).optional(),
});

export const walletEntriesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
