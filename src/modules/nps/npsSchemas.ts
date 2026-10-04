import { z } from "zod";

/** POST /admin/nps/surveys — cria pesquisas NPS para clientes do salão. */
export const npsCreateSurveysSchema = z
  .object({
    barbershopId: z.string().uuid("barbershopId inválido"),
    limit: z.number().int().min(1).max(200).optional().default(50),
  })
  .strict();

/** GET /admin/nps/summary — agregado NPS (janela de 90 dias). */
export const npsSummaryQuerySchema = z
  .object({
    barbershopId: z.string().uuid("barbershopId inválido").optional(),
  })
  .strict();

/** GET /admin/nps/surveys — listagem paginada de pesquisas. */
export const npsListQuerySchema = z
  .object({
    barbershopId: z.string().uuid("barbershopId inválido").optional(),
    status: z.enum(["PENDING", "ANSWERED", "EXPIRED"]).optional(),
    page: z.coerce.number().int().min(1).optional().default(1),
    pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
  })
  .strict();

export const npsSurveyParamsSchema = z
  .object({
    surveyId: z.string().uuid("surveyId inválido"),
  })
  .strict();

/** POST /nps/:surveyId — resposta pública (consentimento LGPD obrigatório). */
export const npsAnswerSchema = z
  .object({
    score: z.number().int().min(0).max(10),
    comment: z.string().trim().max(500, "Comentário deve ter no máximo 500 caracteres").optional(),
    lgpdAccepted: z.boolean().refine((value) => value === true, {
      message: "Consentimento LGPD obrigatório",
    }),
  })
  .strict();

export type NpsCreateSurveysBody = z.infer<typeof npsCreateSurveysSchema>;
export type NpsSummaryQuery = z.infer<typeof npsSummaryQuerySchema>;
export type NpsListQuery = z.infer<typeof npsListQuerySchema>;
export type NpsAnswerBody = z.infer<typeof npsAnswerSchema>;
