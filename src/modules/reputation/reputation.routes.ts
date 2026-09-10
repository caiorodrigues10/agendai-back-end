import { FastifyInstance } from "fastify";
import { authenticate } from "@/shared/infra/http/middlewares/authenticate";
import { authorize } from "@/shared/infra/http/middlewares/authorize";
import { checkSubscription } from "@/shared/infra/http/middlewares/checkSubscription";
import { checkDashboardAccess } from "@/shared/infra/http/middlewares/checkDashboardAccess";
import { setRlsContext } from "@/shared/infra/http/middlewares/setRlsContext";
import { ReputationController } from "./reputationController";

export async function reputationRoutes(app: FastifyInstance) {
  const controller = new ReputationController();

  const ownerRoles = ["MASTER_ADMIN", "OWNER"];
  const ownerGuard = [authenticate, authorize(ownerRoles), checkSubscription, checkDashboardAccess, setRlsContext];

  app.get(
    "/barbershops/:barbershopId/reputation",
    { preHandler: ownerGuard },
    controller.getReputation.bind(controller)
  );

  app.post(
    "/barbershops/:barbershopId/reputation/compute",
    { preHandler: ownerGuard },
    controller.computeReputation.bind(controller)
  );

  app.post(
    "/barbershops/:barbershopId/reviews/:reviewId/respond",
    { preHandler: ownerGuard },
    controller.respondToReview.bind(controller)
  );

  app.get(
    "/barbershops/:barbershopId/reviews/:reviewId/response",
    { preHandler: ownerGuard },
    controller.getReviewResponse.bind(controller)
  );
}
