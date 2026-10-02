import { FastifyInstance } from "fastify";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { setRlsContext } from "../middlewares/setRlsContext";
import { verifyInternalAdmin } from "../middlewares/verifyInternalAdmin";
import { requireInternalPermission } from "../middlewares/requireInternalPermission";
import { INTERNAL_PERMISSIONS } from "@/modules/admin/internalPermissions";
import { AdminFinancialController } from "@/modules/admin/controllers/AdminFinancialController";

const financial = new AdminFinancialController();

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
}
