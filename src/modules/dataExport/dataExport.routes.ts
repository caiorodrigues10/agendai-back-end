/**
 * Rotas da exportação de planilhas.
 *
 * Todas exigem dono (ou MASTER_ADMIN): exportar os dados do negócio é
 * decisão do responsável pelo estabelecimento. O `setRlsContext` garante que
 * a RLS do banco filtre pelo salão da sessão.
 *
 * Os caminhos são escritos por extenso (sem variável) para que o verificador
 * de contrato do frontend consiga casar rota por rota.
 */
import { FastifyInstance } from "fastify";
import { authenticate } from "@/shared/infra/http/middlewares/authenticate";
import { authorize } from "@/shared/infra/http/middlewares/authorize";
import { checkSubscription } from "@/shared/infra/http/middlewares/checkSubscription";
import { checkDashboardAccess } from "@/shared/infra/http/middlewares/checkDashboardAccess";
import { setRlsContext } from "@/shared/infra/http/middlewares/setRlsContext";
import { dataExportController } from "./dataExportController";

export async function dataExportRoutes(app: FastifyInstance) {
  const ownerRoles = ["MASTER_ADMIN", "OWNER"];
  const ownerGuard = [
    authenticate,
    authorize(ownerRoles),
    checkSubscription,
    checkDashboardAccess,
    setRlsContext,
  ];

  app.post(
    "/barbershops/:barbershopId/exports",
    { preHandler: ownerGuard },
    dataExportController.create.bind(dataExportController),
  );
  app.get(
    "/barbershops/:barbershopId/exports",
    { preHandler: ownerGuard },
    dataExportController.list.bind(dataExportController),
  );
  app.get(
    "/barbershops/:barbershopId/exports/:exportId",
    { preHandler: ownerGuard },
    dataExportController.get.bind(dataExportController),
  );
  app.get(
    "/barbershops/:barbershopId/exports/:exportId/download",
    { preHandler: ownerGuard },
    dataExportController.download.bind(dataExportController),
  );
  app.delete(
    "/barbershops/:barbershopId/exports/:exportId",
    { preHandler: ownerGuard },
    dataExportController.remove.bind(dataExportController),
  );
}
