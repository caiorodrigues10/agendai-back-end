import { FastifyInstance } from "fastify";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { setRlsContext } from "../middlewares/setRlsContext";
import { verifyInternalAdmin } from "../middlewares/verifyInternalAdmin";
import { requireInternalPermission } from "../middlewares/requireInternalPermission";
import { INTERNAL_PERMISSIONS } from "@/modules/admin/internalPermissions";
import { AdminFinancialController } from "@/modules/admin/controllers/AdminFinancialController";
import { AdminBillingController } from "@/modules/admin/controllers/AdminBillingController";
import { AdminBillingInsightsController } from "@/modules/admin/controllers/AdminBillingInsightsController";
import { billingStatementQuerySchema } from "@/modules/admin/schemas/adminBillingSchemas";
import { validateSchema } from "../middlewares/validateSchema";

const financial = new AdminFinancialController();
const billing = new AdminBillingController();
const billingInsights = new AdminBillingInsightsController();

export async function adminFinancialRoutes(app: FastifyInstance) {
  const preHandler = [authenticate, authorize(["MASTER_ADMIN"]), verifyInternalAdmin, setRlsContext];
  const financeRead = [...preHandler, requireInternalPermission(INTERNAL_PERMISSIONS.FINANCE_READ)];

  app.get(
    "/admin/financial/overview",
    { preHandler: financeRead },
    financial.overview.bind(financial)
  );

  app.get(
    "/admin/financial/summary",
    { preHandler: financeRead },
    financial.summary.bind(financial)
  );

  app.get(
    "/admin/financial/barbershops",
    { preHandler: financeRead },
    financial.byBarbershop.bind(financial)
  );

  app.get(
    "/admin/financial/barbershops/:barbershopId",
    { preHandler: financeRead },
    financial.barbershopDetail.bind(financial)
  );

  app.get(
    "/admin/billing/summary",
    { preHandler: financeRead },
    billing.summary.bind(billing)
  );

  app.get(
    "/admin/billing/insights",
    { preHandler: financeRead },
    billingInsights.insights.bind(billingInsights)
  );

  app.get(
    "/admin/billing/statement.csv",
    { preHandler: [...financeRead, validateSchema(billingStatementQuerySchema, "query")] },
    billingInsights.statement.bind(billingInsights)
  );
}
