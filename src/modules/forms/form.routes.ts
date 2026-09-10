import { FastifyInstance } from "fastify";
import { authenticate } from "@/shared/infra/http/middlewares/authenticate";
import { authorize } from "@/shared/infra/http/middlewares/authorize";
import { checkSubscription } from "@/shared/infra/http/middlewares/checkSubscription";
import { checkDashboardAccess } from "@/shared/infra/http/middlewares/checkDashboardAccess";
import { setRlsContext } from "@/shared/infra/http/middlewares/setRlsContext";
import { FormController } from "./formController";

export async function formRoutes(app: FastifyInstance) {
  const controller = new FormController();

  const ownerRoles = ["MASTER_ADMIN", "OWNER"];
  const ownerGuard = [authenticate, authorize(ownerRoles), checkSubscription, checkDashboardAccess, setRlsContext];

  app.get(
    "/barbershops/:barbershopId/forms",
    { preHandler: ownerGuard },
    controller.list.bind(controller)
  );

  app.post(
    "/barbershops/:barbershopId/forms",
    { preHandler: ownerGuard },
    controller.create.bind(controller)
  );

  app.get(
    "/barbershops/:barbershopId/forms/:id",
    { preHandler: ownerGuard },
    controller.getById.bind(controller)
  );

  app.patch(
    "/barbershops/:barbershopId/forms/:id",
    { preHandler: ownerGuard },
    controller.update.bind(controller)
  );

  app.delete(
    "/barbershops/:barbershopId/forms/:id",
    { preHandler: ownerGuard },
    controller.delete.bind(controller)
  );

  app.post(
    "/barbershops/:barbershopId/forms/:id/fields",
    { preHandler: ownerGuard },
    controller.addField.bind(controller)
  );

  app.patch(
    "/barbershops/:barbershopId/forms/:id/fields/:fieldId",
    { preHandler: ownerGuard },
    controller.updateField.bind(controller)
  );

  app.delete(
    "/barbershops/:barbershopId/forms/:id/fields/:fieldId",
    { preHandler: ownerGuard },
    controller.deleteField.bind(controller)
  );

  app.post(
    "/barbershops/:barbershopId/forms/:id/responses",
    controller.submitResponse.bind(controller)
  );

  app.get(
    "/barbershops/:barbershopId/forms/:id/responses",
    { preHandler: ownerGuard },
    controller.listResponses.bind(controller)
  );
}
