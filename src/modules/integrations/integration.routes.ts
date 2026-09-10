import { FastifyInstance } from "fastify";
import { authenticate } from "@/shared/infra/http/middlewares/authenticate";
import { authorize } from "@/shared/infra/http/middlewares/authorize";
import { checkSubscription } from "@/shared/infra/http/middlewares/checkSubscription";
import { checkDashboardAccess } from "@/shared/infra/http/middlewares/checkDashboardAccess";
import { setRlsContext } from "@/shared/infra/http/middlewares/setRlsContext";
import { IntegrationController } from "./integrationController";

export async function integrationRoutes(app: FastifyInstance) {
  const controller = new IntegrationController();

  const ownerRoles = ["MASTER_ADMIN", "OWNER"];
  const ownerGuard = [authenticate, authorize(ownerRoles), checkSubscription, checkDashboardAccess, setRlsContext];

  app.post(
    "/barbershops/:barbershopId/integrations",
    { preHandler: ownerGuard },
    controller.create.bind(controller)
  );

  app.get(
    "/barbershops/:barbershopId/integrations",
    { preHandler: ownerGuard },
    controller.list.bind(controller)
  );

  app.get(
    "/barbershops/:barbershopId/integrations/:id",
    { preHandler: ownerGuard },
    controller.getById.bind(controller)
  );

  app.patch(
    "/barbershops/:barbershopId/integrations/:id",
    { preHandler: ownerGuard },
    controller.update.bind(controller)
  );

  app.delete(
    "/barbershops/:barbershopId/integrations/:id",
    { preHandler: ownerGuard },
    controller.delete.bind(controller)
  );

  app.post(
    "/barbershops/:barbershopId/integrations/:id/test",
    { preHandler: ownerGuard },
    controller.testConnection.bind(controller)
  );

  app.post(
    "/barbershops/:barbershopId/integrations/:id/sync",
    { preHandler: ownerGuard },
    controller.triggerSync.bind(controller)
  );

  app.get(
    "/barbershops/:barbershopId/integrations/:id/sync-logs",
    { preHandler: ownerGuard },
    controller.getSyncLogs.bind(controller)
  );
}
