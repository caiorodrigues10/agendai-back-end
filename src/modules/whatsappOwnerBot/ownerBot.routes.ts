import { FastifyInstance } from "fastify";
import { authenticate } from "@/shared/infra/http/middlewares/authenticate";
import { authorize } from "@/shared/infra/http/middlewares/authorize";
import { checkSubscription } from "@/shared/infra/http/middlewares/checkSubscription";
import { checkDashboardAccess } from "@/shared/infra/http/middlewares/checkDashboardAccess";
import { setRlsContext } from "@/shared/infra/http/middlewares/setRlsContext";
import { OwnerBotController } from "./ownerBotController";

export async function ownerBotRoutes(app: FastifyInstance) {
  const controller = new OwnerBotController();

  const ownerRoles = ["MASTER_ADMIN", "OWNER"];
  const ownerGuard = [
    authenticate,
    authorize(ownerRoles),
    checkSubscription,
    checkDashboardAccess,
    setRlsContext,
  ];

  // Webhook da Evolution — sem autenticação de usuário, autenticado por segredo.
  app.post("/webhooks/evolution/platform", controller.handleEvolutionWebhook.bind(controller));

  app.post(
    "/barbershops/:barbershopId/owner-bot/link-code",
    { preHandler: ownerGuard },
    controller.createLinkCode.bind(controller)
  );

  app.get(
    "/barbershops/:barbershopId/owner-bot/status",
    { preHandler: ownerGuard },
    controller.getStatus.bind(controller)
  );

  app.delete(
    "/barbershops/:barbershopId/owner-bot/link",
    { preHandler: ownerGuard },
    controller.unlink.bind(controller)
  );

  app.get(
    "/barbershops/:barbershopId/owner-bot/preferences",
    { preHandler: ownerGuard },
    controller.getPreferences.bind(controller)
  );

  app.put(
    "/barbershops/:barbershopId/owner-bot/preferences",
    { preHandler: ownerGuard },
    controller.updatePreferences.bind(controller)
  );

  app.get(
    "/barbershops/:barbershopId/owner-bot/catalog",
    { preHandler: ownerGuard },
    controller.getCatalog.bind(controller)
  );

  app.get(
    "/barbershops/:barbershopId/owner-bot/action-logs",
    { preHandler: ownerGuard },
    controller.listActionLogs.bind(controller)
  );
}
