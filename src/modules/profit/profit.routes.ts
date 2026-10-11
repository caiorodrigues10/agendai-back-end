import { FastifyInstance } from "fastify";
import { authenticate } from "@/shared/infra/http/middlewares/authenticate";
import { authorize } from "@/shared/infra/http/middlewares/authorize";
import { checkSubscription } from "@/shared/infra/http/middlewares/checkSubscription";
import { checkDashboardAccess } from "@/shared/infra/http/middlewares/checkDashboardAccess";
import { setRlsContext } from "@/shared/infra/http/middlewares/setRlsContext";
import { requirePermission } from "@/shared/infra/http/middlewares/requirePermission";
import { ProfitController } from "./profitController";

export async function profitRoutes(app: FastifyInstance) {
  const controller = new ProfitController();

  const ownerRoles = ["MASTER_ADMIN", "OWNER"];
  const ownerGuard = [authenticate, authorize(ownerRoles), checkSubscription, checkDashboardAccess, setRlsContext];
  // Leitura de lucro/relatórios: EMPLOYEE com REPORTS_VIEW (OWNER/MASTER_ADMIN passam).
  const viewGuard = [authenticate, checkSubscription, checkDashboardAccess, setRlsContext, requirePermission("REPORTS_VIEW")];

  app.get(
    "/barbershops/:barbershopId/profit/settings",
    { preHandler: viewGuard },
    controller.getSettings.bind(controller)
  );

  app.put(
    "/barbershops/:barbershopId/profit/settings",
    { preHandler: ownerGuard },
    controller.updateSettings.bind(controller)
  );

  app.get(
    "/barbershops/:barbershopId/profit/period/:period",
    { preHandler: viewGuard },
    controller.getPeriodProfit.bind(controller)
  );

  app.post(
    "/barbershops/:barbershopId/profit/compute",
    { preHandler: ownerGuard },
    controller.computePeriod.bind(controller)
  );

  app.get(
    "/barbershops/:barbershopId/profit/trend",
    { preHandler: viewGuard },
    controller.getTrend.bind(controller)
  );

  app.get(
    "/barbershops/:barbershopId/profit/by-service",
    { preHandler: viewGuard },
    controller.getByService.bind(controller)
  );

  app.get(
    "/barbershops/:barbershopId/profit/by-staff",
    { preHandler: viewGuard },
    controller.getByStaff.bind(controller)
  );
}
