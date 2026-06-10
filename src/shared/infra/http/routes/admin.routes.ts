import { FastifyInstance } from "fastify";
import { AdminDashboardController } from "@/modules/admin/controllers/AdminDashboardController";
import { AdminBarbershopController } from "@/modules/admin/controllers/AdminBarbershopController";
import { AdminUserController } from "@/modules/admin/controllers/AdminUserController";
import { AdminAuditLogController } from "@/modules/admin/controllers/AdminAuditLogController";
import { BlockedEntityAdminController } from "../../../../modules/admin/controllers/BlockedEntityController"
import { AdminNotificationController } from "@/modules/admin/controllers/AdminNotificationController";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";

const dashboardController = new AdminDashboardController();
const barbershopController = new AdminBarbershopController();
const userController = new AdminUserController();
const auditLogController = new AdminAuditLogController();
const blockedEntityController = new BlockedEntityAdminController();
const notificationController = new AdminNotificationController();

export async function adminRoutes(app: FastifyInstance) {
  const preHandler = [authenticate, authorize(["MASTER_ADMIN"])];

  // ─── Dashboard ───────────────────────────────────────────────────────────
  app.get("/admin/dashboard", { preHandler }, dashboardController.getDashboard.bind(dashboardController));

  // ─── Barbearias ──────────────────────────────────────────────────────────
  app.get("/admin/barbershops", { preHandler }, barbershopController.list.bind(barbershopController));
  app.post("/admin/barbershops", { preHandler }, barbershopController.create.bind(barbershopController));
  app.patch("/admin/barbershops/:id/status", { preHandler }, barbershopController.updateStatus.bind(barbershopController));

  // ─── Usuários ────────────────────────────────────────────────────────────
  app.get("/admin/users", { preHandler }, userController.list.bind(userController));
  app.post("/admin/users", { preHandler }, userController.create.bind(userController));
  app.patch("/admin/users/:id", { preHandler }, userController.update.bind(userController));
  app.delete("/admin/users/:id", { preHandler }, userController.delete.bind(userController));

  // ─── Auditoria ───────────────────────────────────────────────────────────
  app.get("/admin/audit-logs", { preHandler }, auditLogController.list.bind(auditLogController));

  // ─── Entidades Bloqueadas ─────────────────────────────────────────────────
  app.get("/admin/blocked-entities", { preHandler }, blockedEntityController.list.bind(blockedEntityController));
  app.get("/admin/blocked-entities/:id", { preHandler }, blockedEntityController.get.bind(blockedEntityController));
  app.post("/admin/blocked-entities", { preHandler }, blockedEntityController.block.bind(blockedEntityController));
  app.delete("/admin/blocked-entities/:id", { preHandler }, blockedEntityController.unblock.bind(blockedEntityController));

  // ─── Notificações ─────────────────────────────────────────────────────────
  app.get("/admin/notifications", { preHandler }, notificationController.list.bind(notificationController));
  app.get("/admin/notifications/unread-count", { preHandler }, notificationController.unreadCount.bind(notificationController));
  app.patch("/admin/notifications/read-all", { preHandler }, notificationController.markAllRead.bind(notificationController));
  app.patch("/admin/notifications/:id/read", { preHandler }, notificationController.markRead.bind(notificationController));
}