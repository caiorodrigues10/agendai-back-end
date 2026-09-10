import { FastifyInstance } from "fastify";
import { authenticate } from "@/shared/infra/http/middlewares/authenticate";
import { authorize } from "@/shared/infra/http/middlewares/authorize";
import { checkSubscription } from "@/shared/infra/http/middlewares/checkSubscription";
import { checkDashboardAccess } from "@/shared/infra/http/middlewares/checkDashboardAccess";
import { setRlsContext } from "@/shared/infra/http/middlewares/setRlsContext";
import { WhatsAppAiController } from "./whatsappAiController";

export async function whatsappAiRoutes(app: FastifyInstance) {
  const controller = new WhatsAppAiController();

  const ownerRoles = ["MASTER_ADMIN", "OWNER"];
  const ownerGuard = [authenticate, authorize(ownerRoles), checkSubscription, checkDashboardAccess, setRlsContext];

  app.post(
    "/barbershops/:barbershopId/ai/process",
    { preHandler: ownerGuard },
    controller.processIncoming.bind(controller)
  );

  app.get(
    "/barbershops/:barbershopId/ai/conversations",
    { preHandler: ownerGuard },
    controller.listConversations.bind(controller)
  );

  app.get(
    "/barbershops/:barbershopId/ai/conversations/:id",
    { preHandler: ownerGuard },
    controller.getConversationDetail.bind(controller)
  );

  app.get(
    "/barbershops/:barbershopId/ai/intent-logs",
    { preHandler: ownerGuard },
    controller.getIntentLogs.bind(controller)
  );

  app.get(
    "/barbershops/:barbershopId/ai/stats",
    { preHandler: ownerGuard },
    controller.getStats.bind(controller)
  );

  app.post(
    "/barbershops/:barbershopId/ai/conversations/:id/transfer",
    { preHandler: ownerGuard },
    controller.transferToHuman.bind(controller)
  );
}
