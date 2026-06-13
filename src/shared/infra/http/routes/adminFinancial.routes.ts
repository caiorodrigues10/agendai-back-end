import { FastifyInstance } from "fastify";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { AdminFinancialController } from "@/modules/admin/controllers/AdminFinancialController";

const financial = new AdminFinancialController();

export async function adminFinancialRoutes(app: FastifyInstance) {
  const preHandler = [authenticate, authorize(["MASTER_ADMIN"])];

  app.get(
    "/admin/financial/overview",
    { preHandler },
    financial.overview.bind(financial)
  );

  app.get(
    "/admin/financial/summary",
    { preHandler },
    financial.summary.bind(financial)
  );

  app.get(
    "/admin/financial/barbershops",
    { preHandler },
    financial.byBarbershop.bind(financial)
  );

  app.get(
    "/admin/financial/barbershops/:barbershopId",
    { preHandler },
    financial.barbershopDetail.bind(financial)
  );
}
