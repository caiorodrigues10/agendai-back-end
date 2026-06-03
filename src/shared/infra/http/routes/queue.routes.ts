import { FastifyInstance } from "fastify";
import { authenticate } from "../middlewares/authenticate";
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

  app.get("/queue", list.handle.bind(list));
  app.post("/queue", join.handle.bind(join));
  app.patch("/queue/:id", { preHandler: [authenticate] }, update.handle.bind(update));
  app.delete("/queue/:id", { preHandler: [authenticate] }, del.handle.bind(del));
  app.get("/queue/metrics", metrics.handle.bind(metrics));
}
