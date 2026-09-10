import { FastifyInstance } from "fastify";
import { authenticate } from "@/shared/infra/http/middlewares/authenticate";
import { authorize } from "@/shared/infra/http/middlewares/authorize";
import { checkSubscription } from "@/shared/infra/http/middlewares/checkSubscription";
import { checkDashboardAccess } from "@/shared/infra/http/middlewares/checkDashboardAccess";
import { setRlsContext } from "@/shared/infra/http/middlewares/setRlsContext";
import { PurchasingController } from "./purchasingController";

export async function purchasingRoutes(app: FastifyInstance) {
  const controller = new PurchasingController();

  const ownerGuard = [authenticate, authorize(["MASTER_ADMIN", "OWNER"]), checkSubscription, checkDashboardAccess, setRlsContext];

  // ─── Purchase Orders ───────────────────────────────────────
  app.get(
    "/barbershops/:barbershopId/purchase-orders",
    { preHandler: ownerGuard },
    controller.listOrders.bind(controller)
  );

  app.post(
    "/barbershops/:barbershopId/purchase-orders",
    { preHandler: ownerGuard },
    controller.createOrder.bind(controller)
  );

  app.get(
    "/barbershops/:barbershopId/purchase-orders/:id",
    { preHandler: ownerGuard },
    controller.getOrderById.bind(controller)
  );

  app.patch(
    "/barbershops/:barbershopId/purchase-orders/:id",
    { preHandler: ownerGuard },
    controller.updateOrder.bind(controller)
  );

  app.delete(
    "/barbershops/:barbershopId/purchase-orders/:id",
    { preHandler: ownerGuard },
    controller.deleteOrder.bind(controller)
  );

  // ─── Order Items ───────────────────────────────────────────
  app.post(
    "/barbershops/:barbershopId/purchase-orders/:id/items",
    { preHandler: ownerGuard },
    controller.addItem.bind(controller)
  );

  // ─── Receive ───────────────────────────────────────────────
  app.post(
    "/barbershops/:barbershopId/purchase-orders/:id/receive",
    { preHandler: ownerGuard },
    controller.receiveOrder.bind(controller)
  );
}
