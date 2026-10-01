import { FastifyInstance } from "fastify";
import { authenticate } from "@/shared/infra/http/middlewares/authenticate";
import { authorize } from "@/shared/infra/http/middlewares/authorize";
import { checkSubscription } from "@/shared/infra/http/middlewares/checkSubscription";
import { checkProductsInventoryAccess } from "@/shared/infra/http/middlewares/checkProductsInventoryAccess";
import { setRlsContext } from "@/shared/infra/http/middlewares/setRlsContext";
import { ProductReservationController } from "./ProductReservationController";

export async function productReservationRoutes(app: FastifyInstance) {
  const controller = new ProductReservationController();

  const guard = [
    authenticate,
    authorize(["MASTER_ADMIN", "OWNER", "EMPLOYEE"]),
    checkSubscription,
    checkProductsInventoryAccess,
    setRlsContext,
  ];

  // ─── Público (cliente na página /queue/:id) ──────────────────────────
  app.get("/barbershops/:id/public-products", controller.listPublicProducts.bind(controller));

  app.get(
    "/barbershops/:id/public-products/:productId",
    controller.getPublicProduct.bind(controller),
  );

  // Rate limit dedicado: 5 reservas por minuto por IP (mesmo teto de /appointments/public).
  app.post(
    "/barbershops/:id/public-products/:productId/reservations",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    controller.reserve.bind(controller),
  );

  // ─── Painel (sub-tab "Reservas" do módulo de Produtos) ───────────────
  app.get("/product-reservations", { preHandler: guard }, controller.list.bind(controller));

  app.patch(
    "/product-reservations/:id/status",
    { preHandler: guard },
    controller.updateStatus.bind(controller),
  );
}
