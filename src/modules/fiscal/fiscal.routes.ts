import { FastifyInstance } from "fastify";
import { authenticate } from "@/shared/infra/http/middlewares/authenticate";
import { authorize } from "@/shared/infra/http/middlewares/authorize";
import { checkSubscription } from "@/shared/infra/http/middlewares/checkSubscription";
import { checkDashboardAccess } from "@/shared/infra/http/middlewares/checkDashboardAccess";
import { setRlsContext } from "@/shared/infra/http/middlewares/setRlsContext";
import { FiscalController } from "./fiscalController";

export async function fiscalRoutes(app: FastifyInstance) {
  const controller = new FiscalController();
  const ownerGuard = [authenticate, authorize(["MASTER_ADMIN", "OWNER"]), checkSubscription, checkDashboardAccess, setRlsContext];

  app.get(
    "/barbershops/:barbershopId/fiscal/config",
    { preHandler: ownerGuard },
    controller.getConfig.bind(controller)
  );

  app.put(
    "/barbershops/:barbershopId/fiscal/config",
    { preHandler: ownerGuard },
    controller.updateConfig.bind(controller)
  );

  app.post(
    "/barbershops/:barbershopId/fiscal/nfe",
    { preHandler: ownerGuard },
    controller.issueNfe.bind(controller)
  );

  app.get(
    "/barbershops/:barbershopId/fiscal/nfe",
    { preHandler: ownerGuard },
    controller.listRecords.bind(controller)
  );

  app.get(
    "/barbershops/:barbershopId/fiscal/nfe/:id",
    { preHandler: ownerGuard },
    controller.getRecord.bind(controller)
  );

  app.post(
    "/barbershops/:barbershopId/fiscal/nfe/:id/cancel",
    { preHandler: ownerGuard },
    controller.cancelNfe.bind(controller)
  );

  app.get(
    "/barbershops/:barbershopId/fiscal/stats",
    { preHandler: ownerGuard },
    controller.getStats.bind(controller)
  );
}
