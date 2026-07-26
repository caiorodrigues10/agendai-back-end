import { FastifyInstance } from "fastify";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { checkSubscription } from "../middlewares/checkSubscription";
import { checkDashboardAccess } from "../middlewares/checkDashboardAccess";
import { FiadoController } from "@/modules/fiado/controllers/FiadoController";

export async function fiadoRoutes(app: FastifyInstance) {
  const fiado = new FiadoController();

  // Roles que podem acessar fiados da própria barbearia
  const staffRoles = ["MASTER_ADMIN", "OWNER", "EMPLOYEE"];
  // Roles que podem deletar (apenas dono ou admin)
  const ownerRoles = ["MASTER_ADMIN", "OWNER"];

  const staffGuard = [authenticate, authorize(staffRoles), checkSubscription, checkDashboardAccess];
  const ownerGuard = [authenticate, authorize(ownerRoles), checkSubscription, checkDashboardAccess];

  // ─── Resumo (deve vir antes de /:id para não colidir com o parâmetro) ──────
  app.get(
    "/fiado/summary",
    { preHandler: staffGuard },
    fiado.summary.bind(fiado)
  );

  // ─── CRUD principal ──────────────────────────────────────────────────────
  app.post("/fiado", { preHandler: staffGuard }, fiado.create.bind(fiado));
  app.get("/fiado", { preHandler: staffGuard }, fiado.list.bind(fiado));
  app.get("/fiado/:id", { preHandler: staffGuard }, fiado.get.bind(fiado));
  app.patch("/fiado/:id", { preHandler: staffGuard }, fiado.update.bind(fiado));
  app.delete("/fiado/:id", { preHandler: ownerGuard }, fiado.delete.bind(fiado));

  // ─── Pagamentos parciais ─────────────────────────────────────────────────
  app.post(
    "/fiado/:id/payments",
    { preHandler: staffGuard },
    fiado.addPayment.bind(fiado)
  );
}