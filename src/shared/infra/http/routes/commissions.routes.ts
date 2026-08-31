import { FastifyInstance } from "fastify";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { checkSubscription } from "../middlewares/checkSubscription";
import { setRlsContext } from "../middlewares/setRlsContext";
import { CommissionController } from "@/modules/commissions/controllers/CommissionController";

export async function commissionsRoutes(app: FastifyInstance) {
  const controller = new CommissionController();
  const guard = [authenticate, authorize(["MASTER_ADMIN", "OWNER", "EMPLOYEE"]), checkSubscription, setRlsContext];
  app.get("/commissions", { preHandler: guard }, controller.list.bind(controller));
  app.get("/commissions/summary", { preHandler: guard }, controller.summary.bind(controller));
}
