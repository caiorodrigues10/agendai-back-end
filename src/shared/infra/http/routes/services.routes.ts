import { FastifyInstance } from "fastify";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { checkSubscription } from "../middlewares/checkSubscription";
import { setRlsContext } from "../middlewares/setRlsContext";
import { CreateServiceController } from "@/modules/services/useCases/createService/CreateServiceController";
import { ListServicesController } from "@/modules/services/useCases/listServices/ListServicesController";
import { GetServiceController } from "@/modules/services/useCases/getService/GetServiceController";
import { UpdateServiceController } from "@/modules/services/useCases/updateService/UpdateServiceController";
import { DeleteServiceController } from "@/modules/services/useCases/deleteService/DeleteServiceController";
import { authenticateOptional } from "../middlewares/authenticateOptional";

export async function servicesRoutes(app: FastifyInstance) {
  const create = new CreateServiceController();
  const list = new ListServicesController();
  const get = new GetServiceController();
  const update = new UpdateServiceController();
  const del = new DeleteServiceController();

  // Rota pública: sem token devolve apenas serviços agendáveis pelo cliente;
  // com token do staff do estabelecimento devolve a lista completa.
  app.get("/services", { preHandler: [authenticateOptional] }, list.handle.bind(list));
  app.get("/services/:id", { preHandler: [authenticateOptional] }, get.handle.bind(get));

  // checkSubscription adicionado nas rotas de escrita (PUT e PATCH aceitos — o front usa PATCH)
  app.post("/services", { preHandler: [authenticate, authorize(["MASTER_ADMIN", "OWNER"]), checkSubscription, setRlsContext] }, create.handle.bind(create));
  app.put("/services/:id", { preHandler: [authenticate, authorize(["MASTER_ADMIN", "OWNER"]), checkSubscription, setRlsContext] }, update.handle.bind(update));
  app.patch("/services/:id", { preHandler: [authenticate, authorize(["MASTER_ADMIN", "OWNER"]), checkSubscription, setRlsContext] }, update.handle.bind(update));
  app.delete("/services/:id", { preHandler: [authenticate, authorize(["MASTER_ADMIN", "OWNER"]), checkSubscription, setRlsContext] }, del.handle.bind(del));
}