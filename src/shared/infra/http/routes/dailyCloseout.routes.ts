import { FastifyInstance } from "fastify";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { checkSubscription } from "../middlewares/checkSubscription";
import { checkDashboardAccess } from "../middlewares/checkDashboardAccess";
import { setRlsContext } from "../middlewares/setRlsContext";
import { requirePermission } from "../middlewares/requirePermission";
import { DailyCloseoutController } from "@/modules/financial/dailyCloseoutController";

export async function dailyCloseoutRoutes(app: FastifyInstance) {
  const controller = new DailyCloseoutController();

  const ownerRoles = ["MASTER_ADMIN", "OWNER"];
  const ownerGuard = [authenticate, authorize(ownerRoles), checkSubscription, checkDashboardAccess, setRlsContext];
  // Leitura do fechamento: EMPLOYEE com FINANCE_VIEW; fechar o dia: FINANCE_MANAGE.
  const viewGuard = [authenticate, checkSubscription, checkDashboardAccess, setRlsContext, requirePermission("FINANCE_VIEW", "FINANCE_MANAGE")];
  const manageGuard = [authenticate, checkSubscription, checkDashboardAccess, setRlsContext, requirePermission("FINANCE_MANAGE")];

  app.post(
    "/barbershops/:barbershopId/closeout",
    { preHandler: manageGuard },
    controller.closeDay.bind(controller)
  );

  app.get(
    "/barbershops/:barbershopId/closeout",
    { preHandler: viewGuard },
    controller.getCloseout.bind(controller)
  );
}
