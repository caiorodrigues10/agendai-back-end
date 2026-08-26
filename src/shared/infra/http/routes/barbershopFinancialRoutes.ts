import { FastifyInstance } from "fastify";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { checkSubscription } from "../middlewares/checkSubscription";
import { checkDashboardAccess } from "../middlewares/checkDashboardAccess";
import { setRlsContext } from "../middlewares/setRlsContext";
import { BarbershopFinancialController } from "@/modules/barbershops/controllers/BarbershopFinancialController";

const financial = new BarbershopFinancialController();

export async function barbershopFinancialRoutes(app: FastifyInstance) {
  const preHandler = [authenticate, authorize(["OWNER"]), checkSubscription, checkDashboardAccess, setRlsContext];

  app.get("/barbershop/insights", { preHandler }, financial.insights.bind(financial));
  app.get("/barbershop/financial/summary", { preHandler }, financial.summary.bind(financial));
  app.get("/barbershop/financial/expenses", { preHandler }, financial.expenses.bind(financial));
  app.get("/barbershop/financial/fiados", { preHandler }, financial.fiados.bind(financial));
}