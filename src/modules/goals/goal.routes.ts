import { FastifyInstance } from "fastify";
import { authenticate } from "@/shared/infra/http/middlewares/authenticate";
import { authorize } from "@/shared/infra/http/middlewares/authorize";
import { checkSubscription } from "@/shared/infra/http/middlewares/checkSubscription";
import { checkDashboardAccess } from "@/shared/infra/http/middlewares/checkDashboardAccess";
import { setRlsContext } from "@/shared/infra/http/middlewares/setRlsContext";
import { GoalController } from "./goalController";

export async function goalRoutes(app: FastifyInstance) {
  const controller = new GoalController();

  const ownerRoles = ["MASTER_ADMIN", "OWNER"];
  const ownerGuard = [authenticate, authorize(ownerRoles), checkSubscription, checkDashboardAccess, setRlsContext];

  app.post(
    "/barbershops/:barbershopId/goals",
    { preHandler: ownerGuard },
    controller.create.bind(controller)
  );

  app.patch(
    "/barbershops/:barbershopId/goals/:goalId",
    { preHandler: ownerGuard },
    controller.update.bind(controller)
  );

  app.get(
    "/barbershops/:barbershopId/goals",
    { preHandler: ownerGuard },
    controller.list.bind(controller)
  );

  app.get(
    "/barbershops/:barbershopId/goals/ranking",
    { preHandler: ownerGuard },
    controller.getRanking.bind(controller)
  );

  app.get(
    "/barbershops/:barbershopId/goals/:goalId/progress",
    { preHandler: ownerGuard },
    controller.getProgress.bind(controller)
  );
}
