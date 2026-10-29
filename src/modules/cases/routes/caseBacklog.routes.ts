import { FastifyInstance } from "fastify";
import { authenticate } from "@/shared/infra/http/middlewares/authenticate";
import { authenticateClient } from "@/shared/infra/http/middlewares/authenticateClient";
import { authorize } from "@/shared/infra/http/middlewares/authorize";
import { checkSubscription } from "@/shared/infra/http/middlewares/checkSubscription";
import { setRlsContext } from "@/shared/infra/http/middlewares/setRlsContext";
import { segmentFeatureGuard } from "@/shared/infra/http/middlewares/segmentFeatureGuard";
import { CaseBacklogController } from "../controllers/CaseBacklogController";

/**
 * Rotas do backlog de gestão de processos (segmento LAW_FIRM).
 *
 * Abrange: contratos/procurações com assinatura, timesheet, honorários de
 * êxito, digestão de intimações (PJe), NFS-e, alertas de prazo e
 * transferência entre unidades.
 *
 * Exceções ao isolamento do painel:
 *  * `/contracts/sign/:token` — público; o token do signatário é a credencial;
 *  * `/client/portal/cases` — sessão do portal do cliente (`authenticateClient`),
 *    devolvendo apenas o que o escritório marcou como compartilhável.
 */
export async function caseBacklogRoutes(app: FastifyInstance) {
  const controller = new CaseBacklogController();
  const staffGuard = [
    authenticate,
    authorize(["MASTER_ADMIN", "OWNER", "EMPLOYEE"]),
    checkSubscription,
    setRlsContext,
    segmentFeatureGuard("caseManagement"),
  ];

  // ─── Contratos e procurações ───────────────────────────────────────────────
  app.get("/cases/contracts", { preHandler: staffGuard }, controller.listContracts.bind(controller));
  app.post(
    "/cases/:caseId/contracts",
    { preHandler: staffGuard },
    controller.createContract.bind(controller)
  );
  app.patch(
    "/cases/contracts/:contractId",
    { preHandler: staffGuard },
    controller.updateContract.bind(controller)
  );
  app.post(
    "/cases/contracts/:contractId/signers",
    { preHandler: staffGuard },
    controller.addSigner.bind(controller)
  );
  app.post(
    "/cases/contracts/:contractId/send",
    { preHandler: staffGuard },
    controller.sendForSignature.bind(controller)
  );

  // ─── Assinatura (público, sem login) ──────────────────────────────────────
  app.get(
    "/contracts/sign/:token",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    controller.getPublicContract.bind(controller)
  );
  app.post(
    "/contracts/sign/:token",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    controller.signContract.bind(controller)
  );
  app.post(
    "/contracts/sign/:token/decline",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    controller.declineContract.bind(controller)
  );

  // ─── Timesheet ─────────────────────────────────────────────────────────────
  app.get("/cases/time-entries", { preHandler: staffGuard }, controller.listTimeEntries.bind(controller));
  app.post(
    "/cases/:caseId/time-entries",
    { preHandler: staffGuard },
    controller.createTimeEntry.bind(controller)
  );
  app.get(
    "/cases/:caseId/time-entries/summary",
    { preHandler: staffGuard },
    controller.summarizeTimeEntries.bind(controller)
  );
  app.patch(
    "/cases/time-entries/:entryId",
    { preHandler: staffGuard },
    controller.updateTimeEntry.bind(controller)
  );
  app.delete(
    "/cases/time-entries/:entryId",
    { preHandler: staffGuard },
    controller.deleteTimeEntry.bind(controller)
  );

  // ─── Honorários de êxito ───────────────────────────────────────────────────
  app.get("/cases/success-fees", { preHandler: staffGuard }, controller.listSuccessFees.bind(controller));
  app.post(
    "/cases/:caseId/success-fees",
    { preHandler: staffGuard },
    controller.createSuccessFee.bind(controller)
  );
  app.patch(
    "/cases/success-fees/:feeId",
    { preHandler: staffGuard },
    controller.updateSuccessFee.bind(controller)
  );

  // ─── Intimações (PJe/tribunal) ────────────────────────────────────────────
  app.get("/cases/intimations", { preHandler: staffGuard }, controller.listIntimations.bind(controller));
  app.post(
    "/cases/intimations",
    { preHandler: staffGuard },
    controller.createIntimation.bind(controller)
  );
  app.post(
    "/cases/intimations/import",
    { preHandler: staffGuard },
    controller.importIntimations.bind(controller)
  );
  app.patch(
    "/cases/intimations/:intimationId",
    { preHandler: staffGuard },
    controller.triageIntimation.bind(controller)
  );

  // ─── NFS-e ─────────────────────────────────────────────────────────────────
  app.get("/cases/fee-invoices", { preHandler: staffGuard }, controller.listFeeInvoices.bind(controller));
  app.post(
    "/cases/fee-invoices",
    { preHandler: staffGuard },
    controller.createFeeInvoice.bind(controller)
  );
  app.patch(
    "/cases/fee-invoices/:invoiceId",
    { preHandler: staffGuard },
    controller.updateFeeInvoice.bind(controller)
  );
  app.post(
    "/cases/fee-invoices/:invoiceId/issue",
    { preHandler: staffGuard },
    controller.issueFeeInvoice.bind(controller)
  );

  // ─── Alertas de prazo ──────────────────────────────────────────────────────
  app.get(
    "/cases/alerts",
    { preHandler: staffGuard },
    controller.listDeadlineAlerts.bind(controller)
  );

  // ─── Transferência entre unidades ──────────────────────────────────────────
  app.get(
    "/cases/transfers/sibling-shops",
    { preHandler: staffGuard },
    controller.listSiblingShops.bind(controller)
  );
  app.get("/cases/transfers", { preHandler: staffGuard }, controller.listTransfers.bind(controller));
  app.post(
    "/cases/:caseId/transfers",
    { preHandler: staffGuard },
    controller.createTransfer.bind(controller)
  );
  app.post(
    "/cases/transfers/:transferId/respond",
    { preHandler: staffGuard },
    controller.respondTransfer.bind(controller)
  );

  // ─── Portal do cliente ─────────────────────────────────────────────────────
  // Sessão do portal (não do painel): devolve só o que foi compartilhado.
  app.get(
    "/client/portal/cases",
    { preHandler: [authenticateClient] },
    controller.listPortalCases.bind(controller)
  );
}
