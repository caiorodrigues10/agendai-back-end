import { FastifyInstance } from "fastify";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { CreateServiceController } from "@/modules/services/useCases/createService/CreateServiceController";
import { ListServicesController } from "@/modules/services/useCases/listServices/ListServicesController";
import { GetServiceController } from "@/modules/services/useCases/getService/GetServiceController";
import { UpdateServiceController } from "@/modules/services/useCases/updateService/UpdateServiceController";
import { DeleteServiceController } from "@/modules/services/useCases/deleteService/DeleteServiceController";

export async function servicesRoutes(app: FastifyInstance) {
  const create = new CreateServiceController();
  const list = new ListServicesController();
  const get = new GetServiceController();
  const update = new UpdateServiceController();
  const del = new DeleteServiceController();

  app.post("/services", { preHandler: [authenticate, authorize(["MASTER_ADMIN", "OWNER"])] }, create.handle.bind(create));
  app.get("/services", list.handle.bind(list));
  app.get("/services/:id", get.handle.bind(get));
  app.put("/services/:id", { preHandler: [authenticate, authorize(["MASTER_ADMIN", "OWNER"])] }, update.handle.bind(update));
  app.delete("/services/:id", { preHandler: [authenticate, authorize(["MASTER_ADMIN", "OWNER"])] }, del.handle.bind(del));
}
