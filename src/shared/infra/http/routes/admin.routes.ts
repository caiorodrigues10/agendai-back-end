import { FastifyInstance } from "fastify";
import { AdminController } from "@/modules/admin/controllers/AdminController";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";

const adminController = new AdminController();

export async function adminRoutes(app: FastifyInstance) {
  const preHandler = [authenticate, authorize(["MASTER_ADMIN"])];

  app.get("/admin/dashboard", { preHandler }, adminController.getDashboard);
  app.get("/admin/barbershops", { preHandler }, adminController.listBarbershops);
  app.post("/admin/barbershops", { preHandler }, adminController.createBarbershop);
  app.patch("/admin/barbershops/:id/status", { preHandler }, adminController.updateBarbershopStatus);

  app.get("/admin/users", { preHandler }, adminController.listUsers);
  app.post("/admin/users", { preHandler }, adminController.createUser);
  app.patch("/admin/users/:id", { preHandler }, adminController.updateUser);
  app.delete("/admin/users/:id", { preHandler }, adminController.deleteUser);
  app.get("/admin/audit-logs", { preHandler }, adminController.listAuditLogs);
}

