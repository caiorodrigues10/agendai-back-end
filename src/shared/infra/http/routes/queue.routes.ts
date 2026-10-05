import { FastifyInstance } from "fastify";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { authenticateOptional } from "../middlewares/authenticateOptional";
import { checkSubscription } from "../middlewares/checkSubscription"; // NOVO
import { setRlsContext } from "../middlewares/setRlsContext";
import { requirePermission } from "../middlewares/requirePermission";
import { validateSchema } from "@/shared/utils/zodValidation";
import { updateQueueItemSchema } from "@/modules/queue/schemas/queueSchemas";
import { ListQueueController } from "@/modules/queue/useCases/listQueue/ListQueueController";
import { JoinQueueController } from "@/modules/queue/useCases/joinQueue/JoinQueueController";
import { UpdateQueueItemController } from "@/modules/queue/useCases/updateQueueItem/UpdateQueueItemController";
import { DeleteQueueItemController } from "@/modules/queue/useCases/deleteQueueItem/DeleteQueueItemController";
import { GetQueueMetricsController } from "@/modules/queue/useCases/getQueueMetrics/GetQueueMetricsController";

export async function queueRoutes(app: FastifyInstance) {
  const list = new ListQueueController();
  const join = new JoinQueueController();
  const update = new UpdateQueueItemController();
  const del = new DeleteQueueItemController();
  const metrics = new GetQueueMetricsController();

  // GET /queue: público (visão mascarada) + staff (visão completa via token).
  // checkSubscription retorna cedo quando request.user é undefined.
  app.get("/queue", { preHandler: [authenticateOptional, checkSubscription] }, list.handle.bind(list));
  // POST público: authenticateOptional só para reconhecer staff (addedByStaff derivado do JWT).
  app.post("/queue", { preHandler: [authenticateOptional] }, join.handle.bind(join));
  // Alterações/exclusão/métricas: staff do salão e QUEUE_MANAGE
  // (OWNER/MASTER_ADMIN passam pela regra de privilégio). A verificação de
  // tenant segue no use case (assertQueueTenantAccess).
  app.patch("/queue/:id", { preHandler: [authenticate, authorize(["MASTER_ADMIN", "OWNER", "EMPLOYEE"]), checkSubscription, setRlsContext, requirePermission("QUEUE_MANAGE"), validateSchema(updateQueueItemSchema)] }, update.handle.bind(update));
  app.delete("/queue/:id", { preHandler: [authenticate, authorize(["MASTER_ADMIN", "OWNER", "EMPLOYEE"]), checkSubscription, setRlsContext, requirePermission("QUEUE_MANAGE")] }, del.handle.bind(del));
  app.get("/queue/metrics", { preHandler: [authenticate, authorize(["MASTER_ADMIN", "OWNER", "EMPLOYEE"]), checkSubscription, setRlsContext, requirePermission("QUEUE_MANAGE")] }, metrics.handle.bind(metrics));
}
