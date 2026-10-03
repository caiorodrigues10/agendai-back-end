import { FastifyInstance } from "fastify";
import { AdminDashboardController } from "@/modules/admin/controllers/AdminDashboardController";
import { AdminBarbershopController } from "@/modules/admin/controllers/AdminBarbershopController";
import { AdminUserController } from "@/modules/admin/controllers/AdminUserController";
import { AdminAuditLogController } from "@/modules/admin/controllers/AdminAuditLogController";
import { BlockedEntityAdminController } from "@/modules/admin/controllers/BlockedEntityController"
import { AdminNotificationController } from "@/modules/admin/controllers/AdminNotificationController";
import { AdminReferralsController } from "@/modules/admin/controllers/AdminReferralsController";
import { AdminOverviewController } from "@/modules/admin/controllers/AdminOverviewController";
import { AdminAccountsController } from "@/modules/admin/controllers/AdminAccountsController";
import { AdminOperationsController } from "@/modules/admin/controllers/AdminOperationsController";
import { AdminProductController } from "@/modules/admin/controllers/AdminProductController";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { setRlsContext } from "../middlewares/setRlsContext";
import { verifyInternalAdmin } from "../middlewares/verifyInternalAdmin";
import { requireInternalPermission } from "../middlewares/requireInternalPermission";
import { INTERNAL_PERMISSIONS } from "@/modules/admin/internalPermissions";
import { getNotificationOperationsHealth } from "@/modules/notifications/services/notificationOperationsService";

const dashboardController = new AdminDashboardController();
const barbershopController = new AdminBarbershopController();
const userController = new AdminUserController();
const auditLogController = new AdminAuditLogController();
const blockedEntityController = new BlockedEntityAdminController();
const notificationController = new AdminNotificationController();
const referralsController = new AdminReferralsController();
const overviewController = new AdminOverviewController();
const accountsController = new AdminAccountsController();
const operationsController = new AdminOperationsController();
const productController = new AdminProductController();

export async function adminRoutes(app: FastifyInstance) {
  const preHandler = [authenticate, authorize(["MASTER_ADMIN"]), verifyInternalAdmin, setRlsContext];
  const dashboardRead = [...preHandler, requireInternalPermission(INTERNAL_PERMISSIONS.DASHBOARD_READ)];
  const barbershopsManage = [...preHandler, requireInternalPermission(INTERNAL_PERMISSIONS.BARBERSHOPS_MANAGE)];
  const usersManage = [...preHandler, requireInternalPermission(INTERNAL_PERMISSIONS.USERS_MANAGE)];
  const auditRead = [...preHandler, requireInternalPermission(INTERNAL_PERMISSIONS.AUDIT_READ)];
  const operationsRead = [...preHandler, requireInternalPermission(INTERNAL_PERMISSIONS.OPERATIONS_READ)];
  const referralsRead = [...preHandler, requireInternalPermission(INTERNAL_PERMISSIONS.REFERRALS_READ)];

  // ─── Dashboard ───────────────────────────────────────────────────────────
  app.get("/admin/dashboard", { preHandler: dashboardRead }, dashboardController.getDashboard.bind(dashboardController));
  app.get("/admin/overview", { preHandler: dashboardRead }, overviewController.getOverview.bind(overviewController));
  app.get("/admin/product/adoption", { preHandler: dashboardRead }, productController.adoption.bind(productController));

  // ─── Barbearias ──────────────────────────────────────────────────────────
  app.get("/admin/barbershops", { preHandler: barbershopsManage }, barbershopController.list.bind(barbershopController));
  app.post("/admin/barbershops", { preHandler: barbershopsManage }, barbershopController.create.bind(barbershopController));
  app.patch("/admin/barbershops/:id/status", { preHandler: barbershopsManage }, barbershopController.updateStatus.bind(barbershopController));

  // ─── Contas ───────────────────────────────────────────────────────────────
  app.get("/admin/accounts", { preHandler: barbershopsManage }, accountsController.list.bind(accountsController));
  app.get("/admin/accounts/:id", { preHandler: barbershopsManage }, accountsController.getAccount.bind(accountsController));

  // ─── Usuários ────────────────────────────────────────────────────────────
  app.get("/admin/users", { preHandler: usersManage }, userController.list.bind(userController));
  app.post("/admin/users", { preHandler: usersManage }, userController.create.bind(userController));
  app.patch("/admin/users/:id", { preHandler: usersManage }, userController.update.bind(userController));
  app.delete("/admin/users/:id", { preHandler: usersManage }, userController.delete.bind(userController));

  // ─── Auditoria ───────────────────────────────────────────────────────────
  app.get("/admin/audit-logs", { preHandler: auditRead }, auditLogController.list.bind(auditLogController));

  // ─── Entidades Bloqueadas ─────────────────────────────────────────────────
  app.get("/admin/blocked-entities", { preHandler: operationsRead }, blockedEntityController.list.bind(blockedEntityController));
  app.get("/admin/blocked-entities/:id", { preHandler: operationsRead }, blockedEntityController.get.bind(blockedEntityController));
  app.post("/admin/blocked-entities", { preHandler: operationsRead }, blockedEntityController.block.bind(blockedEntityController));
  app.delete("/admin/blocked-entities/:id", { preHandler: operationsRead }, blockedEntityController.unblock.bind(blockedEntityController));

  // ─── Operação ─────────────────────────────────────────────────────────────
  app.get("/admin/operations/health", { preHandler: operationsRead }, operationsController.health.bind(operationsController));

  // ─── Notificações ─────────────────────────────────────────────────────────
  app.get("/admin/notifications", { preHandler: operationsRead }, notificationController.list.bind(notificationController));
  app.get("/admin/notifications/unread-count", { preHandler: operationsRead }, notificationController.unreadCount.bind(notificationController));
  app.patch("/admin/notifications/read-all", { preHandler: operationsRead }, notificationController.markAllRead.bind(notificationController));
  app.patch("/admin/notifications/:id/read", { preHandler: operationsRead }, notificationController.markRead.bind(notificationController));
  app.get("/admin/operations/notifications", { preHandler: operationsRead }, async (_request, reply) => {
    return reply.send({ success: true, data: await getNotificationOperationsHealth() });
  });

  // ─── Indicações ───────────────────────────────────────────────────────────
  app.get("/admin/referrals", { preHandler: referralsRead }, referralsController.getStats.bind(referralsController));
}
