import { FastifyInstance } from "fastify";
import { authenticate } from "@/shared/infra/http/middlewares/authenticate";
import { authorize } from "@/shared/infra/http/middlewares/authorize";
import { checkSubscription } from "@/shared/infra/http/middlewares/checkSubscription";
import { checkDashboardAccess } from "@/shared/infra/http/middlewares/checkDashboardAccess";
import { setRlsContext } from "@/shared/infra/http/middlewares/setRlsContext";
import { StaffController } from "./staffController";

export async function staffRoutes(app: FastifyInstance) {
  const controller = new StaffController();

  const ownerRoles = ["MASTER_ADMIN", "OWNER"];
  const ownerGuard = [authenticate, authorize(ownerRoles), checkSubscription, checkDashboardAccess, setRlsContext];

  // ─── Schedules ────────────────────────────────────────────────
  app.get(
    "/barbershops/:barbershopId/staff-schedules",
    { preHandler: ownerGuard },
    controller.listSchedules.bind(controller)
  );

  app.post(
    "/barbershops/:barbershopId/staff-schedules",
    { preHandler: ownerGuard },
    controller.upsertSchedule.bind(controller)
  );

  app.delete(
    "/barbershops/:barbershopId/staff-schedules/:scheduleId",
    { preHandler: ownerGuard },
    controller.deleteSchedule.bind(controller)
  );

  // ─── Services ─────────────────────────────────────────────────
  app.get(
    "/barbershops/:barbershopId/staff-services",
    { preHandler: ownerGuard },
    controller.listServices.bind(controller)
  );

  app.post(
    "/barbershops/:barbershopId/staff-services",
    { preHandler: ownerGuard },
    controller.assignService.bind(controller)
  );

  app.delete(
    "/barbershops/:barbershopId/staff-services/:staffId/:serviceId",
    { preHandler: ownerGuard },
    controller.removeService.bind(controller)
  );

  // ─── Time Off ─────────────────────────────────────────────────
  app.get(
    "/barbershops/:barbershopId/time-off",
    { preHandler: ownerGuard },
    controller.listTimeOff.bind(controller)
  );

  app.post(
    "/barbershops/:barbershopId/time-off",
    { preHandler: ownerGuard },
    controller.requestTimeOff.bind(controller)
  );

  app.patch(
    "/barbershops/:barbershopId/time-off/:id/approve",
    { preHandler: ownerGuard },
    controller.approveTimeOff.bind(controller)
  );

  app.patch(
    "/barbershops/:barbershopId/time-off/:id/reject",
    { preHandler: ownerGuard },
    controller.rejectTimeOff.bind(controller)
  );
}
