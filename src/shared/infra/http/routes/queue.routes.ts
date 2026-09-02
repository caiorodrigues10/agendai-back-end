import { FastifyInstance } from "fastify";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { authenticateOptional } from "../middlewares/authenticateOptional";
import { checkSubscription } from "../middlewares/checkSubscription"; // NOVO
import { setRlsContext } from "../middlewares/setRlsContext";
import { validateSchema } from "@/shared/utils/zodValidation";
import { updateQueueItemSchema } from "@/modules/queue/schemas/queueSchemas";
import { ListQueueController } from "@/modules/queue/useCases/listQueue/ListQueueController";
import { JoinQueueController } from "@/modules/queue/useCases/joinQueue/JoinQueueController";
import { UpdateQueueItemController } from "@/modules/queue/useCases/updateQueueItem/UpdateQueueItemController";
import { DeleteQueueItemController } from "@/modules/queue/useCases/deleteQueueItem/DeleteQueueItemController";
import { GetQueueMetricsController } from "@/modules/queue/useCases/getQueueMetrics/GetQueueMetricsController";
import { CompleteServiceController } from "@/modules/queue/useCases/completeService/CompleteServiceController";

export async function queueRoutes(app: FastifyInstance) {
  const list = new ListQueueController();
  const join = new JoinQueueController();
  const update = new UpdateQueueItemController();
  const del = new DeleteQueueItemController();
  const metrics = new GetQueueMetricsController();
  const completeService = new CompleteServiceController();

  const staffGuard = [authenticate, authorize(["MASTER_ADMIN", "OWNER", "EMPLOYEE"]), checkSubscription, setRlsContext];

  // GET /queue: público (visão mascarada) + staff (visão completa via token).
  // checkSubscription retorna cedo quando request.user é undefined.
  app.get("/queue", { preHandler: [authenticateOptional, checkSubscription] }, list.handle.bind(list));
  // POST público: authenticateOptional só para reconhecer staff (addedByStaff derivado do JWT).
  app.post("/queue", { preHandler: [authenticateOptional] }, join.handle.bind(join));
  app.patch("/queue/:id", { preHandler: [authenticate, checkSubscription, setRlsContext, validateSchema(updateQueueItemSchema)] }, update.handle.bind(update));
  app.delete("/queue/:id", { preHandler: [authenticate, checkSubscription, setRlsContext] }, del.handle.bind(del));
  app.get("/queue/metrics", { preHandler: [authenticate, checkSubscription, setRlsContext] }, metrics.handle.bind(metrics));
  app.post("/queue/:id/complete", { preHandler: staffGuard }, completeService.handle.bind(completeService));
}