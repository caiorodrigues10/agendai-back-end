import { FastifyInstance } from "fastify";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { checkSubscription } from "../middlewares/checkSubscription";
import { ExpenseController } from "@/modules/expenses/controllers/ExpenseController";

export async function expensesRoutes(app: FastifyInstance) {
  const expenses = new ExpenseController();

  const staffRoles = ["MASTER_ADMIN", "OWNER", "EMPLOYEE"];
  const ownerRoles = ["MASTER_ADMIN", "OWNER"];

  const staffGuard = [authenticate, authorize(staffRoles), checkSubscription];
  const ownerGuard = [authenticate, authorize(ownerRoles), checkSubscription];

  app.get(
    "/expenses/summary",
    { preHandler: staffGuard },
    expenses.summary.bind(expenses)
  );

  app.post("/expenses", { preHandler: staffGuard }, expenses.create.bind(expenses));
  app.get("/expenses", { preHandler: staffGuard }, expenses.list.bind(expenses));
  app.get("/expenses/:id", { preHandler: staffGuard }, expenses.get.bind(expenses));
  app.patch("/expenses/:id", { preHandler: staffGuard }, expenses.update.bind(expenses));
  app.delete("/expenses/:id", { preHandler: ownerGuard }, expenses.delete.bind(expenses));
}