import { FastifyInstance } from "fastify";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { checkSubscription } from "../middlewares/checkSubscription";
import { checkDashboardAccess } from "../middlewares/checkDashboardAccess";
import { setRlsContext } from "../middlewares/setRlsContext";
import { FiadoController } from "@/modules/fiado/controllers/FiadoController";

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

export async function fiadoRoutes(app: FastifyInstance) {
  const fiado = new FiadoController();

  const ownerRoles = ["MASTER_ADMIN", "OWNER"];
  const ownerGuard = [authenticate, authorize(ownerRoles), checkSubscription, checkDashboardAccess, setRlsContext];
  const viewGuard = [authenticate, checkSubscription, checkDashboardAccess, setRlsContext, requirePermission("FINANCE_VIEW", "FINANCE_MANAGE")];
  const createGuard = [authenticate, checkSubscription, checkDashboardAccess, setRlsContext, requirePermission("FINANCE_CREATE", "FINANCE_MANAGE")];
  const editGuard = [authenticate, checkSubscription, checkDashboardAccess, setRlsContext, requirePermission("FINANCE_EDIT", "FINANCE_MANAGE")];

  // ─── Resumo ──────
  app.get("/fiado/summary", { preHandler: viewGuard }, fiado.summary.bind(fiado));

  // ─── CRUD principal ──────────────────────────────────────────────────────
  app.post("/fiado", { preHandler: createGuard }, fiado.create.bind(fiado));
  app.post("/fiado/:id/charge", { preHandler: createGuard }, fiado.charge.bind(fiado));
  app.get("/fiado", { preHandler: viewGuard }, fiado.list.bind(fiado));
  app.get("/fiado/:id", { preHandler: viewGuard }, fiado.get.bind(fiado));
  app.patch("/fiado/:id", { preHandler: editGuard }, fiado.update.bind(fiado));
  app.delete("/fiado/:id", { preHandler: ownerGuard }, fiado.delete.bind(fiado));

  // ─── Pagamentos parciais ─────────────────────────────────────────────────
  app.post("/fiado/:id/payments", { preHandler: createGuard }, fiado.addPayment.bind(fiado));
}
