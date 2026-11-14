import type { FastifyInstance } from "fastify";
import { authenticate } from "@/shared/infra/http/middlewares/authenticate";
import { authorize } from "@/shared/infra/http/middlewares/authorize";
import { checkSubscription } from "@/shared/infra/http/middlewares/checkSubscription";
import { checkDashboardAccess } from "@/shared/infra/http/middlewares/checkDashboardAccess";
import { setRlsContext } from "@/shared/infra/http/middlewares/setRlsContext";
import { AddonCatalogController } from "./addonCatalogController";

/**
 * Catálogo de adicionais do salão (dono) — FASE 2.
 * Rotas novas sob `/salon-addons` (não colidem com o legado `/addons`).
 */
export async function addonCatalogRoutes(app: FastifyInstance): Promise<void> {
  const controller = new AddonCatalogController();
  const ownerRoles = ["MASTER_ADMIN", "OWNER"];
  const ownerGuard = [
    authenticate,
    authorize(ownerRoles),
    checkSubscription,
    checkDashboardAccess,
    setRlsContext,
  ];

  // ─── Salon addons (CRUD) ────────────────────────────────────────
  app.get(
    "/barbershops/:barbershopId/salon-addons",
    { preHandler: ownerGuard },
    controller.listAddons.bind(controller)
  );
  app.post(
    "/barbershops/:barbershopId/salon-addons",
    { preHandler: ownerGuard },
    controller.createAddon.bind(controller)
  );
  app.get(
    "/barbershops/:barbershopId/salon-addons/:id",
    { preHandler: ownerGuard },
    controller.getAddon.bind(controller)
  );
  app.patch(
    "/barbershops/:barbershopId/salon-addons/:id",
    { preHandler: ownerGuard },
    controller.updateAddon.bind(controller)
  );
  app.delete(
    "/barbershops/:barbershopId/salon-addons/:id",
    { preHandler: ownerGuard },
    controller.deleteAddon.bind(controller)
  );

  // ─── Service ↔ addon links (GET/PUT) ────────────────────────────
  app.get(
    "/barbershops/:barbershopId/services/:serviceId/addon-links",
    { preHandler: ownerGuard },
    controller.listServiceAddonLinks.bind(controller)
  );
  app.put(
    "/barbershops/:barbershopId/services/:serviceId/addon-links",
    { preHandler: ownerGuard },
    controller.replaceServiceAddonLinks.bind(controller)
  );
}
