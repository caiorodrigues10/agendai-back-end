import { FastifyInstance } from "fastify";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { checkSubscription } from "../middlewares/checkSubscription";
import { setRlsContext } from "../middlewares/setRlsContext";
import {
  ServiceCategoryController,
  ExpenseCategoryController,
} from "@/modules/serviceCategories/controllers/CategoryController";

const serviceCat = new ServiceCategoryController();
const expenseCat = new ExpenseCategoryController();

export async function categoriesRoutes(app: FastifyInstance) {
  const staffGuard = [
    authenticate,
    authorize(["MASTER_ADMIN", "OWNER", "EMPLOYEE"]),
    checkSubscription,
    setRlsContext,
  ];
  const ownerGuard = [
    authenticate,
    authorize(["MASTER_ADMIN", "OWNER"]),
    checkSubscription,
    setRlsContext,
  ];

  // ─── Service Categories ───────────────────────────────────────────────────
  app.get(
    "/service-categories",
    { preHandler: staffGuard },
    serviceCat.list.bind(serviceCat)
  );
  app.post(
    "/service-categories",
    { preHandler: ownerGuard },
    serviceCat.create.bind(serviceCat)
  );
  app.patch(
    "/service-categories/:id",
    { preHandler: ownerGuard },
    serviceCat.update.bind(serviceCat)
  );
  app.delete(
    "/service-categories/:id",
    { preHandler: ownerGuard },
    serviceCat.delete.bind(serviceCat)
  );

  // ─── Expense Categories ───────────────────────────────────────────────────
  app.get(
    "/expense-categories",
    { preHandler: staffGuard },
    expenseCat.list.bind(expenseCat)
  );
  app.post(
    "/expense-categories",
    { preHandler: ownerGuard },
    expenseCat.create.bind(expenseCat)
  );
  app.patch(
    "/expense-categories/:id",
    { preHandler: ownerGuard },
    expenseCat.update.bind(expenseCat)
  );
  app.delete(
    "/expense-categories/:id",
    { preHandler: ownerGuard },
    expenseCat.delete.bind(expenseCat)
  );
}
