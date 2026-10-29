import { FastifyInstance } from "fastify";
import { authenticate } from "@/shared/infra/http/middlewares/authenticate";
import { authorize } from "@/shared/infra/http/middlewares/authorize";
import { checkSubscription } from "@/shared/infra/http/middlewares/checkSubscription";
import { checkDashboardAccess } from "@/shared/infra/http/middlewares/checkDashboardAccess";
import { setRlsContext } from "@/shared/infra/http/middlewares/setRlsContext";
import { advertisingGuard } from "@/shared/infra/http/middlewares/advertisingGuard";
import { LoyaltyController } from "./loyaltyController";

export async function loyaltyRoutes(app: FastifyInstance) {
  const controller = new LoyaltyController();

  const ownerRoles = ["MASTER_ADMIN", "OWNER"];
  // Fidelidade é divulgação comercial (recompensa por voltar): desligada
  // em segmentos com restrição de publicidade (ex.: advocacia).
  const ownerGuard = [authenticate, authorize(ownerRoles), checkSubscription, checkDashboardAccess, advertisingGuard(), setRlsContext];

  app.post(
    "/barbershops/:barbershopId/loyalty/program",
    { preHandler: ownerGuard },
    controller.configureProgram.bind(controller)
  );

  app.get(
    "/barbershops/:barbershopId/loyalty/program",
    { preHandler: ownerGuard },
    controller.getProgram.bind(controller)
  );

  app.get(
    "/barbershops/:barbershopId/loyalty/accounts/:clientId",
    { preHandler: ownerGuard },
    controller.getAccount.bind(controller)
  );

  app.get(
    "/barbershops/:barbershopId/loyalty/accounts/:clientId/balance",
    { preHandler: ownerGuard },
    controller.getBalance.bind(controller)
  );

  app.post(
    "/barbershops/:barbershopId/loyalty/visit",
    { preHandler: ownerGuard },
    controller.recordVisit.bind(controller)
  );

  app.post(
    "/barbershops/:barbershopId/loyalty/redeem",
    { preHandler: ownerGuard },
    controller.redeemReward.bind(controller)
  );

  app.post(
    "/barbershops/:barbershopId/loyalty/adjust",
    { preHandler: ownerGuard },
    controller.adjustManual.bind(controller)
  );

  app.post(
    "/barbershops/:barbershopId/loyalty/cashback/record",
    { preHandler: ownerGuard },
    controller.recordCashback.bind(controller)
  );

  app.post(
    "/barbershops/:barbershopId/loyalty/cashback/redeem",
    { preHandler: ownerGuard },
    controller.redeemCashback.bind(controller)
  );
}
