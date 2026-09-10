import { FastifyInstance } from "fastify";
import { authenticate } from "@/shared/infra/http/middlewares/authenticate";
import { authorize } from "@/shared/infra/http/middlewares/authorize";
import { checkSubscription } from "@/shared/infra/http/middlewares/checkSubscription";
import { checkDashboardAccess } from "@/shared/infra/http/middlewares/checkDashboardAccess";
import { setRlsContext } from "@/shared/infra/http/middlewares/setRlsContext";
import { VoucherController } from "./voucherController";

export async function voucherRoutes(app: FastifyInstance) {
  const controller = new VoucherController();

  const ownerRoles = ["MASTER_ADMIN", "OWNER"];
  const ownerGuard = [authenticate, authorize(ownerRoles), checkSubscription, checkDashboardAccess, setRlsContext];

  app.get(
    "/barbershops/:barbershopId/vouchers",
    { preHandler: ownerGuard },
    controller.listVouchers.bind(controller)
  );

  app.post(
    "/barbershops/:barbershopId/vouchers",
    { preHandler: ownerGuard },
    controller.create.bind(controller)
  );

  app.patch(
    "/barbershops/:barbershopId/vouchers/:id",
    { preHandler: ownerGuard },
    controller.update.bind(controller)
  );

  app.delete(
    "/barbershops/:barbershopId/vouchers/:id",
    { preHandler: ownerGuard },
    controller.delete.bind(controller)
  );

  app.post(
    "/barbershops/:barbershopId/vouchers/validate",
    { preHandler: ownerGuard },
    controller.validateCode.bind(controller)
  );

  app.post(
    "/barbershops/:barbershopId/vouchers/:id/apply",
    { preHandler: ownerGuard },
    controller.applyVoucher.bind(controller)
  );

  app.get(
    "/barbershops/:barbershopId/vouchers/:id/usages",
    { preHandler: ownerGuard },
    controller.getUsages.bind(controller)
  );
}
