import { FastifyInstance } from "fastify";
import { authenticate } from "@/shared/infra/http/middlewares/authenticate";
import { authorize } from "@/shared/infra/http/middlewares/authorize";
import { checkSubscription } from "@/shared/infra/http/middlewares/checkSubscription";
import { checkDashboardAccess } from "@/shared/infra/http/middlewares/checkDashboardAccess";
import { setRlsContext } from "@/shared/infra/http/middlewares/setRlsContext";
import { QualityController } from "./qualityController";

export async function qualityRoutes(app: FastifyInstance) {
  const controller = new QualityController();

  const ownerGuard = [authenticate, authorize(["MASTER_ADMIN", "OWNER"]), checkSubscription, checkDashboardAccess, setRlsContext];

  // ─── Protocols ─────────────────────────────────────────────
  app.get(
    "/barbershops/:barbershopId/protocols",
    { preHandler: ownerGuard },
    controller.listProtocols.bind(controller)
  );

  app.post(
    "/barbershops/:barbershopId/protocols",
    { preHandler: ownerGuard },
    controller.createProtocol.bind(controller)
  );

  app.patch(
    "/barbershops/:barbershopId/protocols/:id",
    { preHandler: ownerGuard },
    controller.updateProtocol.bind(controller)
  );

  app.delete(
    "/barbershops/:barbershopId/protocols/:id",
    { preHandler: ownerGuard },
    controller.deleteProtocol.bind(controller)
  );

  // ─── Audits ────────────────────────────────────────────────
  app.post(
    "/barbershops/:barbershopId/protocols/:id/audits",
    { preHandler: ownerGuard },
    controller.runAudit.bind(controller)
  );

  app.get(
    "/barbershops/:barbershopId/protocols/:id/audits",
    { preHandler: ownerGuard },
    controller.listAudits.bind(controller)
  );

  // ─── Overview ──────────────────────────────────────────────
  app.get(
    "/barbershops/:barbershopId/quality/overview",
    { preHandler: ownerGuard },
    controller.getOverview.bind(controller)
  );
}
