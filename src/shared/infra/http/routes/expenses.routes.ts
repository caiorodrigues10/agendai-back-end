import { FastifyInstance } from "fastify";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { checkSubscription } from "../middlewares/checkSubscription";
import { checkDashboardAccess } from "../middlewares/checkDashboardAccess";
import { setRlsContext } from "../middlewares/setRlsContext";
import { ExpenseController } from "@/modules/expenses/controllers/ExpenseController";

function requirePermission(...perms: string[]) {
  return async (request: any, reply: any) => {
    const user = request.user;
    if (!user) return reply.status(401).send({ error: "Unauthorized" });
    if (user.role === "MASTER_ADMIN" || user.role === "OWNER") return;
    const userPerms = user.permissions ?? [];
    if (!perms.some(p => userPerms.includes(p))) {
      return reply.status(403).send({ error: "Permissão insuficiente" });
    }
  };
}

export async function expensesRoutes(app: FastifyInstance) {
  const expenses = new ExpenseController();

  const ownerRoles = ["MASTER_ADMIN", "OWNER"];
  const ownerGuard = [authenticate, authorize(ownerRoles), checkSubscription, checkDashboardAccess, setRlsContext];
  const viewGuard = [authenticate, checkSubscription, checkDashboardAccess, setRlsContext, requirePermission("FINANCE_VIEW", "FINANCE_MANAGE")];
  const createGuard = [authenticate, checkSubscription, checkDashboardAccess, setRlsContext, requirePermission("FINANCE_CREATE", "FINANCE_MANAGE")];
  const editGuard = [authenticate, checkSubscription, checkDashboardAccess, setRlsContext, requirePermission("FINANCE_EDIT", "FINANCE_MANAGE")];

  app.get(
    "/expenses/summary",
    { preHandler: viewGuard },
    expenses.summary.bind(expenses)
  );

  app.post("/expenses", { preHandler: createGuard }, expenses.create.bind(expenses));
  app.get("/expenses", { preHandler: viewGuard }, expenses.list.bind(expenses));
  app.get("/expenses/:id", { preHandler: viewGuard }, expenses.get.bind(expenses));
  app.patch("/expenses/:id", { preHandler: editGuard }, expenses.update.bind(expenses));
  app.delete("/expenses/:id", { preHandler: ownerGuard }, expenses.delete.bind(expenses));
}
