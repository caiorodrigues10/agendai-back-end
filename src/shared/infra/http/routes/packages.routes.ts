import { FastifyInstance } from "fastify";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { checkSubscription } from "../middlewares/checkSubscription";
import {
  ServicePackageController,
  ClientPackageController,
} from "@/modules/packages/controllers/PackageController";

export async function packagesRoutes(app: FastifyInstance) {
  const catalog = new ServicePackageController();
  const sold = new ClientPackageController();

  const staffGuard = [
    authenticate,
    authorize(["MASTER_ADMIN", "OWNER", "EMPLOYEE"]),
    checkSubscription,
  ];
  const ownerGuard = [
    authenticate,
    authorize(["MASTER_ADMIN", "OWNER"]),
    checkSubscription,
  ];

  app.get(
    "/service-packages",
    { preHandler: staffGuard },
    catalog.list.bind(catalog)
  );
  app.post(
    "/service-packages",
    { preHandler: ownerGuard },
    catalog.create.bind(catalog)
  );
  app.patch(
    "/service-packages/:id",
    { preHandler: ownerGuard },
    catalog.update.bind(catalog)
  );

  app.post(
    "/client-packages",
    { preHandler: staffGuard },
    sold.sell.bind(sold)
  );
  app.get(
    "/client-packages",
    { preHandler: staffGuard },
    sold.list.bind(sold)
  );
  app.post(
    "/client-packages/:id/book",
    { preHandler: staffGuard },
    sold.book.bind(sold)
  );
  app.post(
    "/client-packages/:id/consume",
    { preHandler: staffGuard },
    sold.consume.bind(sold)
  );
  app.post(
    "/client-packages/:id/cancel",
    { preHandler: ownerGuard },
    sold.cancel.bind(sold)
  );
}
