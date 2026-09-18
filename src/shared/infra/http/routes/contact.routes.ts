import { FastifyInstance } from "fastify";
import { ContactController } from "@/modules/contact/controllers/ContactController";

export async function contactRoutes(app: FastifyInstance) {
  const controller = new ContactController();

  /** POST /contact — formulário público da landing/marketing. */
  app.post(
    "/contact",
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "15 minutes",
          keyGenerator: (request: { ip?: string }) => request.ip || "unknown",
        },
      },
    },
    controller.submit.bind(controller)
  );
}
