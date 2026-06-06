import { FastifyInstance } from "fastify";
import { authenticate } from "../middlewares/authenticate";
import { checkSubscription } from "../middlewares/checkSubscription"; // NOVO
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

  // checkSubscription adicionado nas rotas autenticadas
  app.get("/queue", { preHandler: [authenticate, checkSubscription] }, list.handle.bind(list));
  app.post("/queue", join.handle.bind(join)); // público — cliente entra sem conta
  app.patch("/queue/:id", { preHandler: [authenticate, checkSubscription] }, update.handle.bind(update));
  app.delete("/queue/:id", { preHandler: [authenticate, checkSubscription] }, del.handle.bind(del));
  app.get("/queue/metrics", metrics.handle.bind(metrics));
}