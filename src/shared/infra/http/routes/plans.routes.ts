import { FastifyInstance } from "fastify";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { PlansController } from "../../../../modules/controllers/PlansController"
import { SubscribeController } from "@/modules/subscriptions/useCases/subscribe/SubscribeController";
import { GetSubscriptionController } from "@/modules/subscriptions/useCases/getSubscription/GetSubscriptionController";
import { CancelSubscriptionController } from "@/modules/subscriptions/useCases/cancelSubscription/CancelSubscriptionController";
import { ListSubscriptionsController } from "@/modules/subscriptions/useCases/listSubscriptions/ListSubscriptionsController";

export async function plansRoutes(app: FastifyInstance) {
  const plans = new PlansController();
  const subscribe = new SubscribeController();
  const getSubscription = new GetSubscriptionController();
  const cancelSubscription = new CancelSubscriptionController();
  const listSubscriptions = new ListSubscriptionsController();

  // Planos — leitura pública
  app.get("/plans", plans.list.bind(plans));
  app.get("/plans/:id", plans.get.bind(plans));

  // Planos — admin
  app.post("/admin/plans", { preHandler: [authenticate, authorize(["MASTER_ADMIN"])] }, plans.create.bind(plans));
  app.patch("/admin/plans/:id", { preHandler: [authenticate, authorize(["MASTER_ADMIN"])] }, plans.update.bind(plans));
  app.delete("/admin/plans/:id", { preHandler: [authenticate, authorize(["MASTER_ADMIN"])] }, plans.deactivate.bind(plans));

  // Assinaturas — owner
  app.post("/subscriptions", { preHandler: [authenticate, authorize(["MASTER_ADMIN", "OWNER"])] }, subscribe.handle.bind(subscribe));
  app.get("/subscriptions/me", { preHandler: [authenticate] }, getSubscription.handle.bind(getSubscription));
  app.delete("/subscriptions/me", { preHandler: [authenticate, authorize(["MASTER_ADMIN", "OWNER"])] }, cancelSubscription.handle.bind(cancelSubscription));

  // Assinaturas — admin
  app.get("/admin/subscriptions", { preHandler: [authenticate, authorize(["MASTER_ADMIN"])] }, listSubscriptions.handle.bind(listSubscriptions));
  app.get("/admin/subscriptions/:id", { preHandler: [authenticate, authorize(["MASTER_ADMIN"])] }, getSubscription.handle.bind(getSubscription));
  app.delete("/admin/subscriptions/:barbershopId", { preHandler: [authenticate, authorize(["MASTER_ADMIN"])] }, cancelSubscription.handle.bind(cancelSubscription));
}