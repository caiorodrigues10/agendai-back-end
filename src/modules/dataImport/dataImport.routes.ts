/**
 * Rotas do assistente de importação de planilhas.
 *
 * Todas exigem dono (ou MASTER_ADMIN): importar dado é decisão do
 * responsável pelo estabelecimento. O `setRlsContext` garante que a RLS do
 * banco filtre pelo salão da sessão.
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
import { dataImportController } from "./dataImportController";

export async function dataImportRoutes(app: FastifyInstance) {
  const ownerRoles = ["MASTER_ADMIN", "OWNER"];
  const ownerGuard = [
    authenticate,
    authorize(ownerRoles),
    checkSubscription,
    checkDashboardAccess,
    setRlsContext,
  ];

  app.post(
    "/barbershops/:barbershopId/imports",
    { preHandler: ownerGuard },
    dataImportController.upload.bind(dataImportController),
  );
  app.get(
    "/barbershops/:barbershopId/imports",
    { preHandler: ownerGuard },
    dataImportController.list.bind(dataImportController),
  );
  app.get(
    "/barbershops/:barbershopId/imports/active",
    { preHandler: ownerGuard },
    dataImportController.active.bind(dataImportController),
  );
  app.get(
    "/barbershops/:barbershopId/imports/template",
    { preHandler: ownerGuard },
    dataImportController.template.bind(dataImportController),
  );
  app.get(
    "/barbershops/:barbershopId/imports/:batchId",
    { preHandler: ownerGuard },
    dataImportController.get.bind(dataImportController),
  );
  app.get(
    "/barbershops/:barbershopId/imports/:batchId/preview",
    { preHandler: ownerGuard },
    dataImportController.preview.bind(dataImportController),
  );
  app.get(
    "/barbershops/:barbershopId/imports/:batchId/errors.csv",
    { preHandler: ownerGuard },
    dataImportController.errorsCsv.bind(dataImportController),
  );
  app.patch(
    "/barbershops/:barbershopId/imports/:batchId/target",
    { preHandler: ownerGuard },
    dataImportController.configureTarget.bind(dataImportController),
  );
  app.patch(
    "/barbershops/:barbershopId/imports/:batchId/mapping",
    { preHandler: ownerGuard },
    dataImportController.saveMapping.bind(dataImportController),
  );
  app.post(
    "/barbershops/:barbershopId/imports/:batchId/validate",
    { preHandler: ownerGuard },
    dataImportController.validate.bind(dataImportController),
  );
  app.post(
    "/barbershops/:barbershopId/imports/:batchId/confirm",
    { preHandler: ownerGuard },
    dataImportController.confirm.bind(dataImportController),
  );
  app.post(
    "/barbershops/:barbershopId/imports/:batchId/undo",
    { preHandler: ownerGuard },
    dataImportController.undo.bind(dataImportController),
  );
  app.post(
    "/barbershops/:barbershopId/imports/:batchId/cancel",
    { preHandler: ownerGuard },
    dataImportController.cancel.bind(dataImportController),
  );
}
