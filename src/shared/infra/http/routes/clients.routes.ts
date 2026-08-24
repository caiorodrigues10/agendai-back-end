import { FastifyInstance } from "fastify";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { checkSubscription } from "../middlewares/checkSubscription";
import { ClientController } from "@/modules/clients/controllers/ClientController";

export async function clientsRoutes(app: FastifyInstance) {
  const clients = new ClientController();
  const staffGuard = [
    authenticate,
    authorize(["MASTER_ADMIN", "OWNER", "EMPLOYEE"]),
    checkSubscription,
  ];

  app.post("/clients", { preHandler: staffGuard }, clients.create.bind(clients));
  app.get("/clients", { preHandler: staffGuard }, clients.list.bind(clients));
  app.get("/clients/:id", { preHandler: staffGuard }, clients.get.bind(clients));
  app.patch("/clients/:id", { preHandler: staffGuard }, clients.update.bind(clients));
}
