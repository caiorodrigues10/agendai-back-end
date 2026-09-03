import { z } from "zod";
import { retailSalePayloadSchema } from "@/modules/products/schemas/productSchemas";

/**
 * Campos extras (ex.: `completedAt` enviado pelo front) são ignorados.
 * O timestamp de conclusão é definido no repositório ao status COMPLETED.
 */
export const updateQueueItemSchema = z.object({
  status: z.enum(["waiting", "in_chair", "completed", "cancelled"]),
  completedBy: z.string().uuid().optional(),
  finalPrice: z.number().min(0).optional(),
  paymentMethod: z.enum(["pix", "credit_card", "debit_card", "fiado"]).optional(),
  /** Índice na fila WAITING (0 = frente, N = fim). Usado ao voltar da cadeira. */
  insertAt: z.number().int().min(0).max(500).optional(),
  commissionSplits: z.array(z.object({
    professionalId: z.string().uuid(),
    percentage: z.number().min(0).max(100),
  })).max(20).optional(),
  retailSale: retailSalePayloadSchema.optional(),
});
