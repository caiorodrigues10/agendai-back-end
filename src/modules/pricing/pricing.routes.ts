import { FastifyInstance } from "fastify";
import { authenticate } from "@/shared/infra/http/middlewares/authenticate";
import { authorize } from "@/shared/infra/http/middlewares/authorize";
import { checkSubscription } from "@/shared/infra/http/middlewares/checkSubscription";
import { checkDashboardAccess } from "@/shared/infra/http/middlewares/checkDashboardAccess";
import { setRlsContext } from "@/shared/infra/http/middlewares/setRlsContext";
import { PricingController } from "./pricingController";

export async function pricingRoutes(app: FastifyInstance) {
  const controller = new PricingController();

  const ownerRoles = ["MASTER_ADMIN", "OWNER"];
  const ownerGuard = [authenticate, authorize(ownerRoles), checkSubscription, checkDashboardAccess, setRlsContext];

  app.get(
    "/barbershops/:barbershopId/pricing-rules",
    { preHandler: ownerGuard },
    controller.listRules.bind(controller)
  );

  app.post(
    "/barbershops/:barbershopId/pricing-rules",
    { preHandler: ownerGuard },
    controller.create.bind(controller)
  );

  app.patch(
    "/barbershops/:barbershopId/pricing-rules/:id",
    { preHandler: ownerGuard },
    controller.update.bind(controller)
  );

  app.post(
    "/barbershops/:barbershopId/pricing-rules/:id/toggle",
    { preHandler: ownerGuard },
    controller.toggleActive.bind(controller)
  );

  app.delete(
    "/barbershops/:barbershopId/pricing-rules/:id",
    { preHandler: ownerGuard },
    controller.delete.bind(controller)
  );

  app.post(
    "/barbershops/:barbershopId/evaluate-price",
    { preHandler: ownerGuard },
    controller.evaluatePrice.bind(controller)
  );
}
