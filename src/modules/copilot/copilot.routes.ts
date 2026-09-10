import { FastifyInstance } from "fastify";
import { authenticate } from "@/shared/infra/http/middlewares/authenticate";
import { authorize } from "@/shared/infra/http/middlewares/authorize";
import { checkSubscription } from "@/shared/infra/http/middlewares/checkSubscription";
import { checkDashboardAccess } from "@/shared/infra/http/middlewares/checkDashboardAccess";
import { setRlsContext } from "@/shared/infra/http/middlewares/setRlsContext";
import { CopilotController } from "./copilotController";

export async function copilotRoutes(app: FastifyInstance) {
  const controller = new CopilotController();

  const ownerRoles = ["MASTER_ADMIN", "OWNER"];
  const ownerGuard = [authenticate, authorize(ownerRoles), checkSubscription, checkDashboardAccess, setRlsContext];

  app.get(
    "/barbershops/:barbershopId/copilot/suggestions",
    { preHandler: ownerGuard },
    controller.listSuggestions.bind(controller)
  );

  app.patch(
    "/barbershops/:barbershopId/copilot/suggestions/:id/read",
    { preHandler: ownerGuard },
    controller.markRead.bind(controller)
  );

  app.patch(
    "/barbershops/:barbershopId/copilot/suggestions/:id/dismiss",
    { preHandler: ownerGuard },
    controller.dismiss.bind(controller)
  );

  app.patch(
    "/barbershops/:barbershopId/copilot/suggestions/:id/accept",
    { preHandler: ownerGuard },
    controller.accept.bind(controller)
  );

  app.post(
    "/barbershops/:barbershopId/copilot/generate",
    { preHandler: ownerGuard },
    controller.generate.bind(controller)
  );
}
