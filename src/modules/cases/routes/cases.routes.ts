import { FastifyInstance } from "fastify";
import { authenticate } from "@/shared/infra/http/middlewares/authenticate";
import { authorize } from "@/shared/infra/http/middlewares/authorize";
import { checkSubscription } from "@/shared/infra/http/middlewares/checkSubscription";
import { setRlsContext } from "@/shared/infra/http/middlewares/setRlsContext";
import { segmentFeatureGuard } from "@/shared/infra/http/middlewares/segmentFeatureGuard";
import { CaseManagementController } from "../controllers/CaseManagementController";

/**
 * Rotas da gestão de processos do escritório (segmento LAW_FIRM).
 *
 * Todas exigem usuário autenticado do tenant (`setRlsContext` para o
 * isolamento por `barbershopId`). Dados de caso, prazo, documento e
 * andamento são **internos**: nunca há rota pública para eles.
 */
export async function casesRoutes(app: FastifyInstance) {
  const controller = new CaseManagementController();
  const staffGuard = [
    authenticate,
    authorize(["MASTER_ADMIN", "OWNER", "EMPLOYEE"]),
    checkSubscription,
    setRlsContext,
    // Gestão de processos só existe nos segmentos com a feature
    // `caseManagement` (escritório de advocacia).
    segmentFeatureGuard("caseManagement"),
  ];

  // ─── Casos do escritório ───────────────────────────────────────────────────
  app.get("/cases", { preHandler: staffGuard }, controller.listCases.bind(controller));
  app.get("/cases/pipeline", { preHandler: staffGuard }, controller.pipeline.bind(controller));
  app.get(
    "/cases/reports/practice-areas",
    { preHandler: staffGuard },
    controller.practiceAreaReport.bind(controller)
  );
  app.get("/cases/:caseId", { preHandler: staffGuard }, controller.getCase.bind(controller));
  app.get(
    "/cases/:caseId/overview",
    { preHandler: staffGuard },
    controller.overview.bind(controller)
  );

  // ─── Prazos do escritório ──────────────────────────────────────────────────
  // Antes de `/cases/:caseId` para não ser capturada pelo parâmetro.
  app.get(
    "/cases/deadlines",
    { preHandler: staffGuard },
    controller.listDeadlines.bind(controller)
  );
  app.patch(
    "/cases/deadlines/:deadlineId",
    { preHandler: staffGuard },
    controller.updateDeadline.bind(controller)
  );
  app.delete(
    "/cases/deadlines/:deadlineId",
    { preHandler: staffGuard },
    controller.deleteDeadline.bind(controller)
  );

  // ─── Feriados do escritório ───────────────────────────────────────────────
  app.get(
    "/cases/holidays",
    { preHandler: staffGuard },
    controller.listHolidays.bind(controller)
  );
  app.post(
    "/cases/holidays",
    { preHandler: staffGuard },
    controller.createHoliday.bind(controller)
  );
  app.delete(
    "/cases/holidays/:holidayId",
    { preHandler: staffGuard },
    controller.deleteHoliday.bind(controller)
  );

  // ─── Tarefas ──────────────────────────────────────────────────────────────
  app.get(
    "/cases/:caseId/tasks",
    { preHandler: staffGuard },
    controller.listTasks.bind(controller)
  );
  app.post(
    "/cases/:caseId/tasks",
    { preHandler: staffGuard },
    controller.createTask.bind(controller)
  );
  app.patch(
    "/cases/:caseId/tasks/:taskId",
    { preHandler: staffGuard },
    controller.updateTask.bind(controller)
  );
  app.delete(
    "/cases/:caseId/tasks/:taskId",
    { preHandler: staffGuard },
    controller.deleteTask.bind(controller)
  );

  // ─── Prazos do caso ───────────────────────────────────────────────────────
  app.post(
    "/cases/:caseId/deadlines",
    { preHandler: staffGuard },
    controller.createDeadline.bind(controller)
  );

  // ─── Andamentos ───────────────────────────────────────────────────────────
  app.get(
    "/cases/:caseId/events",
    { preHandler: staffGuard },
    controller.listEvents.bind(controller)
  );
  app.post(
    "/cases/:caseId/events",
    { preHandler: staffGuard },
    controller.createEvent.bind(controller)
  );

  // ─── Documentos ───────────────────────────────────────────────────────────
  app.get(
    "/cases/:caseId/documents",
    { preHandler: staffGuard },
    controller.listDocuments.bind(controller)
  );
  app.post(
    "/cases/:caseId/documents",
    { preHandler: staffGuard },
    controller.createDocument.bind(controller)
  );
  app.delete(
    "/cases/:caseId/documents/:documentId",
    { preHandler: staffGuard },
    controller.deleteDocument.bind(controller)
  );
}
