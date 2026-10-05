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
  /** Procedimento executado (ficha técnica do cliente). Gravado pós-commit em client_procedure_records. */
  procedure: z.object({
    title: z.string().min(1).max(120),
    formula: z.string().max(2000).optional(),
    details: z.string().max(2000).optional(),
    serviceName: z.string().max(120).optional(),
    professionalName: z.string().max(120).optional(),
  }).optional(),
});
