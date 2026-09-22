import { FastifyInstance } from "fastify";
import { authenticate } from "@/shared/infra/http/middlewares/authenticate";
import { authorize } from "@/shared/infra/http/middlewares/authorize";
import { setRlsContext } from "@/shared/infra/http/middlewares/setRlsContext";
import { verifyInternalAdmin, protectLastAdmin } from "@/shared/infra/http/middlewares/verifyInternalAdmin";
import { validateSchema } from "@/shared/infra/http/middlewares/validateSchema";
import { TeamController } from "@/modules/admin/controllers/TeamController";
import { TicketController } from "@/modules/admin/controllers/TicketController";
import { TaskController } from "@/modules/admin/controllers/TaskController";
import { WorkSummaryController } from "@/modules/admin/controllers/WorkSummaryController";
import {
  listTicketsQuerySchema,
  listTasksQuerySchema,
  adminAuditLogQuerySchema,
} from "@/modules/admin/schemas/internalSchemas";

const internalGuards = [authenticate, authorize(["MASTER_ADMIN"]), verifyInternalAdmin, setRlsContext];

export async function adminInternalRoutes(app: FastifyInstance) {
  const team = new TeamController();
  const ticket = new TicketController();
  const task = new TaskController();
  const work = new WorkSummaryController();

  // ── Public: Accept invitation ──────────────────────────────────────────────
  app.get("/admin/invitations/:token/info", team.getInvitationInfo.bind(team));
  app.post("/admin/invitations/accept", team.acceptInvitation.bind(team));

  // ── Work Summary ───────────────────────────────────────────────────────────
  app.get("/admin/work/summary", { preHandler: internalGuards }, work.get.bind(work));

  // ── Team ───────────────────────────────────────────────────────────────────
  app.get("/admin/team", { preHandler: internalGuards }, team.list.bind(team));
  app.post("/admin/team/invitations", { preHandler: internalGuards }, team.invite.bind(team));
  app.post("/admin/team/invitations/:id/resend", { preHandler: internalGuards }, team.resendInvitation.bind(team));
  app.delete("/admin/team/invitations/:id", { preHandler: internalGuards }, team.revokeInvitation.bind(team));
  app.patch("/admin/team/:id/status", {
    preHandler: [...internalGuards, protectLastAdmin],
  }, team.deactivate.bind(team));

  // ── Tickets ────────────────────────────────────────────────────────────────
  app.get("/admin/tickets", {
    preHandler: [...internalGuards, validateSchema(listTicketsQuerySchema, "query")],
  }, ticket.list.bind(ticket));
  app.post("/admin/tickets", { preHandler: internalGuards }, ticket.create.bind(ticket));
  app.get("/admin/tickets/:id", { preHandler: internalGuards }, ticket.get.bind(ticket));
  app.patch("/admin/tickets/:id", { preHandler: internalGuards }, ticket.update.bind(ticket));
  app.post("/admin/tickets/:id/comments", { preHandler: internalGuards }, ticket.addComment.bind(ticket));

  // ── Tasks ──────────────────────────────────────────────────────────────────
  app.get("/admin/tasks", {
    preHandler: [...internalGuards, validateSchema(listTasksQuerySchema, "query")],
  }, task.list.bind(task));
  app.post("/admin/tasks", { preHandler: internalGuards }, task.create.bind(task));
  app.get("/admin/tasks/:id", { preHandler: internalGuards }, task.get.bind(task));
  app.patch("/admin/tasks/:id", { preHandler: internalGuards }, task.update.bind(task));
  app.post("/admin/tasks/:id/comments", { preHandler: internalGuards }, task.addComment.bind(task));

  // ── Audit Logs (extended filters) ──────────────────────────────────────────
  // Reuse existing AdminAuditLogController — no extra import needed since
  // the existing admin routes already handle this endpoint.
}
