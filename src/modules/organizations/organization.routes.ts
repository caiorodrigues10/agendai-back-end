import { FastifyInstance } from "fastify";
import { authenticate } from "@/shared/infra/http/middlewares/authenticate";
import { authorize } from "@/shared/infra/http/middlewares/authorize";
import { checkSubscription } from "@/shared/infra/http/middlewares/checkSubscription";
import { checkDashboardAccess } from "@/shared/infra/http/middlewares/checkDashboardAccess";
import { setRlsContext } from "@/shared/infra/http/middlewares/setRlsContext";
import { OrganizationController } from "./organizationController";

export async function organizationRoutes(app: FastifyInstance) {
  const controller = new OrganizationController();

  const guard = [authenticate, authorize(["MASTER_ADMIN", "OWNER"]), checkSubscription, checkDashboardAccess, setRlsContext];

  app.post("/organizations", { preHandler: guard }, controller.create.bind(controller));

  app.get("/organizations", { preHandler: guard }, controller.listMy.bind(controller));

  app.get("/organizations/:id", { preHandler: guard }, controller.getById.bind(controller));

  app.get("/organizations/:id/dashboard", { preHandler: guard }, controller.getDashboard.bind(controller));

  app.patch("/organizations/:id", { preHandler: guard }, controller.update.bind(controller));

  app.delete("/organizations/:id", { preHandler: guard }, controller.delete.bind(controller));

  app.post("/organizations/:id/members", { preHandler: guard }, controller.inviteMember.bind(controller));

  app.get("/organizations/:id/members", { preHandler: guard }, controller.listMembers.bind(controller));

  app.patch("/organizations/:id/members/:memberId", { preHandler: guard }, controller.updateMemberRole.bind(controller));

  app.delete("/organizations/:id/members/:memberId", { preHandler: guard }, controller.removeMember.bind(controller));

  app.get("/organizations/:id/available-barbershops", { preHandler: guard }, controller.listAvailableBarbershops.bind(controller));

  app.post("/organizations/:id/barbershops", { preHandler: guard }, controller.attachBarbershop.bind(controller));

  app.delete("/organizations/:id/barbershops/:barbershopId", { preHandler: guard }, controller.detachBarbershop.bind(controller));
}
