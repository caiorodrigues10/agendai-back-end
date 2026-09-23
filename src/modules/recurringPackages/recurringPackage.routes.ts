import { FastifyInstance } from "fastify";
import { authenticate } from "@/shared/infra/http/middlewares/authenticate";
import { authorize } from "@/shared/infra/http/middlewares/authorize";
import { checkSubscription } from "@/shared/infra/http/middlewares/checkSubscription";
import { checkDashboardAccess } from "@/shared/infra/http/middlewares/checkDashboardAccess";
import { setRlsContext } from "@/shared/infra/http/middlewares/setRlsContext";
import { RecurringPackageController } from "./recurringPackageController";

export async function recurringPackageRoutes(app: FastifyInstance) {
  const controller = new RecurringPackageController();

  const ownerRoles = ["MASTER_ADMIN", "OWNER"];
  const ownerGuard = [authenticate, authorize(ownerRoles), checkSubscription, checkDashboardAccess, setRlsContext];

  // ── New routes ────────────────────────────────────

  // Plans
  app.get(
    "/barbershops/:barbershopId/recurring-package-plans",
    { preHandler: ownerGuard },
    controller.listPlans.bind(controller)
  );

  app.post(
    "/barbershops/:barbershopId/recurring-package-plans",
    { preHandler: ownerGuard },
    controller.createPlan.bind(controller)
  );

  app.patch(
    "/barbershops/:barbershopId/recurring-package-plans/:planId",
    { preHandler: ownerGuard },
    controller.updatePlan.bind(controller)
  );

  // Packages
  app.get(
    "/barbershops/:barbershopId/client-recurring-packages",
    { preHandler: ownerGuard },
    controller.listPackages.bind(controller)
  );

  app.post(
    "/barbershops/:barbershopId/client-recurring-packages",
    { preHandler: ownerGuard },
    controller.createPackage.bind(controller)
  );

  app.get(
    "/barbershops/:barbershopId/client-recurring-packages/:id",
    { preHandler: ownerGuard },
    controller.getPackageDetails.bind(controller)
  );

  // Package actions
  app.post(
    "/barbershops/:barbershopId/client-recurring-packages/:id/activate",
    { preHandler: ownerGuard },
    controller.activatePackage.bind(controller)
  );

  app.post(
    "/barbershops/:barbershopId/client-recurring-packages/:id/pause",
    { preHandler: ownerGuard },
    controller.pausePackage.bind(controller)
  );

  app.post(
    "/barbershops/:barbershopId/client-recurring-packages/:id/resume",
    { preHandler: ownerGuard },
    controller.resumePackage.bind(controller)
  );

  app.post(
    "/barbershops/:barbershopId/client-recurring-packages/:id/cancel",
    { preHandler: ownerGuard },
    controller.cancelPackage.bind(controller)
  );

  // Cycles
  app.post(
    "/barbershops/:barbershopId/client-recurring-packages/:id/cycles/:cycleId/payment",
    { preHandler: ownerGuard },
    controller.recordPayment.bind(controller)
  );

  // Benefits
  app.post(
    "/barbershops/:barbershopId/client-recurring-packages/:id/benefits/:benefitId/use",
    { preHandler: ownerGuard },
    controller.useBenefit.bind(controller)
  );

  app.post(
    "/barbershops/:barbershopId/client-recurring-packages/:id/benefits/:benefitId/reverse",
    { preHandler: ownerGuard },
    controller.reverseBenefit.bind(controller)
  );

  // ── Old routes (aliases for backward compatibility) ──

  // Plans
  app.get(
    "/barbershops/:barbershopId/membership-plans",
    { preHandler: ownerGuard },
    controller.listPlans.bind(controller)
  );

  app.post(
    "/barbershops/:barbershopId/membership-plans",
    { preHandler: ownerGuard },
    controller.createPlan.bind(controller)
  );

  app.patch(
    "/barbershops/:barbershopId/membership-plans/:planId",
    { preHandler: ownerGuard },
    controller.updatePlan.bind(controller)
  );

  // Memberships
  app.get(
    "/barbershops/:barbershopId/client-memberships",
    { preHandler: ownerGuard },
    controller.listPackages.bind(controller)
  );

  app.post(
    "/barbershops/:barbershopId/client-memberships",
    { preHandler: ownerGuard },
    controller.createPackage.bind(controller)
  );

  app.get(
    "/barbershops/:barbershopId/client-memberships/:id",
    { preHandler: ownerGuard },
    controller.getPackageDetails.bind(controller)
  );

  // Membership actions
  app.post(
    "/barbershops/:barbershopId/client-memberships/:id/activate",
    { preHandler: ownerGuard },
    controller.activatePackage.bind(controller)
  );

  app.post(
    "/barbershops/:barbershopId/client-memberships/:id/pause",
    { preHandler: ownerGuard },
    controller.pausePackage.bind(controller)
  );

  app.post(
    "/barbershops/:barbershopId/client-memberships/:id/resume",
    { preHandler: ownerGuard },
    controller.resumePackage.bind(controller)
  );

  app.post(
    "/barbershops/:barbershopId/client-memberships/:id/cancel",
    { preHandler: ownerGuard },
    controller.cancelPackage.bind(controller)
  );

  // Cycles
  app.post(
    "/barbershops/:barbershopId/client-memberships/:id/cycles/:cycleId/payment",
    { preHandler: ownerGuard },
    controller.recordPayment.bind(controller)
  );

  // Benefits
  app.post(
    "/barbershops/:barbershopId/client-memberships/:id/benefits/:benefitId/use",
    { preHandler: ownerGuard },
    controller.useBenefit.bind(controller)
  );

  app.post(
    "/barbershops/:barbershopId/client-memberships/:id/benefits/:benefitId/reverse",
    { preHandler: ownerGuard },
    controller.reverseBenefit.bind(controller)
  );
}
