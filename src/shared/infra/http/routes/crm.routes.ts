import { FastifyInstance } from "fastify";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { checkSubscription } from "../middlewares/checkSubscription";
import { checkDashboardAccess } from "../middlewares/checkDashboardAccess";
import { setRlsContext } from "../middlewares/setRlsContext";
import { CrmController } from "@/modules/crm/controllers/CrmController";
import { ExportFinancialDataUseCase } from "@/modules/crm/useCases/exportFinancialData/ExportFinancialDataUseCase";
import { container } from "tsyringe";
import { AppError } from "@/shared/errors/AppError";

export async function crmRoutes(app: FastifyInstance) {
  const crm = new CrmController();
  const guard = [authenticate, authorize(["MASTER_ADMIN", "OWNER", "EMPLOYEE"]), checkSubscription, checkDashboardAccess, setRlsContext];
  app.get("/crm/overview", { preHandler: guard }, crm.overview.bind(crm));
  app.get("/crm/clients", { preHandler: guard }, crm.listClients.bind(crm));
  app.post("/crm/clients/merge", { preHandler: guard }, crm.merge.bind(crm));
  app.get("/crm/clients/:id", { preHandler: guard }, crm.client.bind(crm));
  app.post("/crm/backfill", { preHandler: guard }, crm.backfill.bind(crm));
  app.post("/crm/backfill/all", { preHandler: guard }, crm.backfillAll.bind(crm));
  app.get("/crm/backfill/runs", { preHandler: guard }, crm.backfillRuns.bind(crm));
  app.get("/crm/forecast", { preHandler: guard }, crm.forecast.bind(crm));
  app.post("/crm/campaigns/preview", { preHandler: guard }, crm.previewCampaign.bind(crm));
  app.post("/crm/campaigns", { preHandler: guard }, crm.createCampaign.bind(crm));
  app.get("/crm/campaigns", { preHandler: guard }, crm.listCampaigns.bind(crm));
  app.get("/crm/campaigns/:id", { preHandler: guard }, crm.campaign.bind(crm));

  app.get("/barbershop/financial/export", { preHandler: guard }, async (request, reply) => {
    const query = request.query as { from?: string; to?: string; barbershopId?: string };
    const user = request.user!;
    const barbershopId = user.role === 'MASTER_ADMIN' ? query.barbershopId : user.barbershopId;
    if (!barbershopId) throw new AppError('barbershopId é obrigatório', 400);
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from ? new Date(query.from) : new Date(to.getTime() - 30 * 86_400_000);
    const useCase = container.resolve(ExportFinancialDataUseCase);
    const csv = await useCase.execute({ barbershopId, from, to, requestingUserRole: user.role });
    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="relatorio-financeiro-${from.toISOString().slice(0, 10)}-${to.toISOString().slice(0, 10)}.csv"`);
    reply.send('\uFEFF' + csv);
  });
}
