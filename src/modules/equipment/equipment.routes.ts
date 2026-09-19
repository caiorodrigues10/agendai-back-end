import { FastifyInstance } from "fastify";
import { authenticate } from "@/shared/infra/http/middlewares/authenticate";
import { authorize } from "@/shared/infra/http/middlewares/authorize";
import { checkSubscription } from "@/shared/infra/http/middlewares/checkSubscription";
import { checkDashboardAccess } from "@/shared/infra/http/middlewares/checkDashboardAccess";
import { setRlsContext } from "@/shared/infra/http/middlewares/setRlsContext";
import { EquipmentController } from "./equipmentController";

export async function equipmentRoutes(app: FastifyInstance) {
  const controller = new EquipmentController();

  const ownerRoles = ["MASTER_ADMIN", "OWNER"];
  const ownerGuard = [
    authenticate,
    authorize(ownerRoles),
    checkSubscription,
    checkDashboardAccess,
    setRlsContext,
  ];

  // ─── Equipment CRUD ──────────────────────────────────────
  app.get(
    "/barbershops/:barbershopId/equipment",
    { preHandler: ownerGuard },
    controller.listEquipment.bind(controller)
  );

  app.post(
    "/barbershops/:barbershopId/equipment",
    { preHandler: ownerGuard },
    controller.createEquipment.bind(controller)
  );

  app.get(
    "/barbershops/:barbershopId/equipment/:id",
    { preHandler: ownerGuard },
    controller.getEquipment.bind(controller)
  );

  app.patch(
    "/barbershops/:barbershopId/equipment/:id",
    { preHandler: ownerGuard },
    controller.updateEquipment.bind(controller)
  );

  app.delete(
    "/barbershops/:barbershopId/equipment/:id",
    { preHandler: ownerGuard },
    controller.deleteEquipment.bind(controller)
  );

  // ─── Movements ───────────────────────────────────────────
  app.get(
    "/barbershops/:barbershopId/equipment-movements",
    { preHandler: ownerGuard },
    controller.listMovements.bind(controller)
  );

  app.post(
    "/barbershops/:barbershopId/equipment-movements",
    { preHandler: ownerGuard },
    controller.createMovement.bind(controller)
  );

  // ─── Needs ───────────────────────────────────────────────
  app.get(
    "/barbershops/:barbershopId/equipment-needs",
    { preHandler: ownerGuard },
    controller.listNeeds.bind(controller)
  );

  app.post(
    "/barbershops/:barbershopId/equipment-needs",
    { preHandler: ownerGuard },
    controller.createNeed.bind(controller)
  );

  app.patch(
    "/barbershops/:barbershopId/equipment-needs/:needId",
    { preHandler: ownerGuard },
    controller.updateNeed.bind(controller)
  );

  // ─── Dashboard ───────────────────────────────────────────
  app.get(
    "/barbershops/:barbershopId/equipment-dashboard",
    { preHandler: ownerGuard },
    controller.getDashboard.bind(controller)
  );
}
