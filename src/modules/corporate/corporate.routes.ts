import { FastifyInstance } from "fastify";
import { authenticate } from "@/shared/infra/http/middlewares/authenticate";
import { authorize } from "@/shared/infra/http/middlewares/authorize";
import { checkSubscription } from "@/shared/infra/http/middlewares/checkSubscription";
import { checkDashboardAccess } from "@/shared/infra/http/middlewares/checkDashboardAccess";
import { setRlsContext } from "@/shared/infra/http/middlewares/setRlsContext";
import { CorporateController } from "./corporateController";

export async function corporateRoutes(app: FastifyInstance) {
  const controller = new CorporateController();

  const adminRoles = ["MASTER_ADMIN"];
  const adminGuard = [authenticate, authorize(adminRoles)];

  const ownerRoles = ["MASTER_ADMIN", "OWNER"];
  const ownerGuard = [authenticate, authorize(ownerRoles), checkSubscription, checkDashboardAccess, setRlsContext];

  // ─── Admin: Corporate Plans ───────────────────────────────────────
  app.get(
    "/admin/corporate-plans",
    { preHandler: adminGuard },
    controller.listPlans.bind(controller)
  );

  app.get(
    "/admin/corporate-plans/:id",
    { preHandler: adminGuard },
    controller.getPlan.bind(controller)
  );

  app.post(
    "/admin/corporate-plans",
    { preHandler: adminGuard },
    controller.createPlan.bind(controller)
  );

  app.patch(
    "/admin/corporate-plans/:id",
    { preHandler: adminGuard },
    controller.updatePlan.bind(controller)
  );

  app.delete(
    "/admin/corporate-plans/:id",
    { preHandler: adminGuard },
    controller.deletePlan.bind(controller)
  );

  // ─── Admin: Corporate Subscriptions ───────────────────────────────
  app.post(
    "/admin/corporate-plans/:id/subscribe",
    { preHandler: adminGuard },
    controller.subscribe.bind(controller)
  );

  app.get(
    "/admin/corporate-plans/:id/subscriptions",
    { preHandler: adminGuard },
    controller.listSubscriptions.bind(controller)
  );

  // ─── Barbershop: Validate Subscription ────────────────────────────
  app.get(
    "/barbershops/:barbershopId/corporate/validate",
    { preHandler: ownerGuard },
    controller.validateSubscription.bind(controller)
  );
}
