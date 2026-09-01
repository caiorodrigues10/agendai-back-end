import { FastifyInstance } from "fastify";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { checkSubscription } from "../middlewares/checkSubscription";
import { checkDashboardAccess } from "../middlewares/checkDashboardAccess";
import { setRlsContext } from "../middlewares/setRlsContext";
import { CrmController } from "@/modules/crm/controllers/CrmController";

export async function crmRoutes(app: FastifyInstance) {
  const crm = new CrmController();
  const guard = [authenticate, authorize(["MASTER_ADMIN", "OWNER", "EMPLOYEE"]), checkSubscription, checkDashboardAccess, setRlsContext];
  app.get("/crm/overview", { preHandler: guard }, crm.overview.bind(crm));
  app.get("/crm/clients", { preHandler: guard }, crm.listClients.bind(crm));
  app.post("/crm/clients/merge", { preHandler: guard }, crm.merge.bind(crm));
  app.get("/crm/clients/:id", { preHandler: guard }, crm.client.bind(crm));
  app.post("/crm/backfill", { preHandler: guard }, crm.backfill.bind(crm));
  app.get("/crm/forecast", { preHandler: guard }, crm.forecast.bind(crm));
  app.post("/crm/campaigns/preview", { preHandler: guard }, crm.previewCampaign.bind(crm));
  app.post("/crm/campaigns", { preHandler: guard }, crm.createCampaign.bind(crm));
  app.get("/crm/campaigns/:id", { preHandler: guard }, crm.campaign.bind(crm));
}
