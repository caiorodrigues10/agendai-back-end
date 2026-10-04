import { FastifyInstance } from "fastify";
import { validateSchema } from "@/shared/infra/http/middlewares/validateSchema";
import { npsAnswerSchema, npsSurveyParamsSchema } from "../npsSchemas";
import { PublicNpsController } from "../controllers/PublicNpsController";

const controller = new PublicNpsController();

/** Rotas públicas do NPS (sem autenticação — link da pesquisa). */
export async function npsRoutes(app: FastifyInstance) {
  app.get(
    "/nps/:surveyId",
    {
      preHandler: [validateSchema(npsSurveyParamsSchema, "params")],
      config: {
        rateLimit: {
          max: 30,
          timeWindow: "5 minutes",
          keyGenerator: (request: { ip?: string }) => request.ip || "unknown",
        },
      },
    },
    controller.get.bind(controller),
  );

  app.post(
    "/nps/:surveyId",
    {
      preHandler: [
        validateSchema(npsSurveyParamsSchema, "params"),
        validateSchema(npsAnswerSchema, "body"),
      ],
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "15 minutes",
          keyGenerator: (request: { ip?: string }) => request.ip || "unknown",
        },
      },
    },
    controller.answer.bind(controller),
  );
}
