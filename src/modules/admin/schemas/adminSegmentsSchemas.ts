import { z } from "zod";
import { BusinessSegment } from "@prisma/client";

export const adminBarbershopSegmentParamsSchema = z
  .object({
    id: z.string().uuid("id inválido"),
  })
  .strict();

/**
 * Troca de segmento pelo master. O motivo é obrigatório (auditoria) e
 * `confirm` libera a troca quando existem dados incompatíveis com o novo
 * segmento (produtos, estoque, comissões, gorjeta ou ficha auxiliar).
 */
export const adminBarbershopSegmentBodySchema = z
  .object({
    segment: z.nativeEnum(BusinessSegment, {
      errorMap: () => ({ message: "Segmento inválido" }),
    }),
    reason: z
      .string()
      .trim()
      .min(10, "Informe um motivo com pelo menos 10 caracteres")
      .max(500),
    confirm: z.boolean().optional().default(false),
  })
  .strict();

export type AdminBarbershopSegmentBody = z.infer<
  typeof adminBarbershopSegmentBodySchema
>;
