import { FastifyInstance } from "fastify";
import { authenticate } from "../middlewares/authenticate";
import { checkSubscription } from "../middlewares/checkSubscription";
import { checkDashboardAccess } from "../middlewares/checkDashboardAccess";
import { setRlsContext } from "../middlewares/setRlsContext";
import { requirePermission } from "../middlewares/requirePermission";
import { BarbershopFinancialController } from "@/modules/barbershops/controllers/BarbershopFinancialController";

const financial = new BarbershopFinancialController();

export async function barbershopFinancialRoutes(app: FastifyInstance) {
  // Leitura financeira: além de OWNER/MASTER_ADMIN, EMPLOYEE com FINANCE_VIEW.
  const viewGuard = [authenticate, checkSubscription, checkDashboardAccess, setRlsContext, requirePermission("FINANCE_VIEW", "FINANCE_MANAGE")];

  app.get("/barbershop/insights", { preHandler: viewGuard }, financial.insights.bind(financial));
  app.get("/barbershop/financial/summary", { preHandler: viewGuard }, financial.summary.bind(financial));
  app.get("/barbershop/financial/expenses", { preHandler: viewGuard }, financial.expenses.bind(financial));
  app.get("/barbershop/financial/fiados", { preHandler: viewGuard }, financial.fiados.bind(financial));
  app.get("/barbershop/weather-insights", { preHandler: viewGuard }, financial.weatherInsights.bind(financial));
}