import { FastifyInstance } from "fastify";
import { authenticate } from "@/shared/infra/http/middlewares/authenticate";
import { setRlsContext } from "@/shared/infra/http/middlewares/setRlsContext";
import { SupportController } from "./supportController";

export async function supportRoutes(app: FastifyInstance) {
  const controller = new SupportController();

  // Qualquer papel autenticado pode reportar (sem checkSubscription/authorize
  // para que employees também consigam abrir chamados de suporte).
  const userGuard = [authenticate, setRlsContext];

  app.post(
    "/support/reports",
    {
      preHandler: userGuard,
      config: { rateLimit: { max: 10, timeWindow: "1 hour" } },
    },
    controller.createReport.bind(controller)
  );

  app.get(
    "/support/reports",
    { preHandler: userGuard },
    controller.listMyReports.bind(controller)
  );

  app.get(
    "/support/reports/:id",
    { preHandler: userGuard },
    controller.getMyReport.bind(controller)
  );

  app.post(
    "/support/reports/:id/comments",
    {
      preHandler: userGuard,
      config: { rateLimit: { max: 30, timeWindow: "1 hour" } },
    },
    controller.addComment.bind(controller)
  );
}
