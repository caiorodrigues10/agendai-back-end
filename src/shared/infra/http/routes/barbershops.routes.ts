import { FastifyInstance } from "fastify";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { checkSubscription } from "../middlewares/checkSubscription"; 
import { CreateBarbershopController } from "@/modules/barbershops/useCases/createBarbershop/CreateBarbershopController";
import { ListBarbershopsController } from "@/modules/barbershops/useCases/listBarbershops/ListBarbershopsController";
import { GetBarbershopController } from "@/modules/barbershops/useCases/getBarbershop/GetBarbershopController";
import { UpdateBarbershopController } from "@/modules/barbershops/useCases/updateBarbershop/UpdateBarbershopController";
import { DeleteBarbershopController } from "@/modules/barbershops/useCases/deleteBarbershop/DeleteBarbershopController";
import { GetScheduleController } from "@/modules/barbershops/useCases/getSchedule/GetScheduleController";
import { UpdateScheduleController } from "@/modules/barbershops/useCases/updateSchedule/UpdateScheduleController";

import { LogoController } from "@/modules/barbershops/useCases/uploadLogo/LogoController";


export async function barbershopsRoutes(app: FastifyInstance) {
  const create = new CreateBarbershopController();
  const list = new ListBarbershopsController();
  const get = new GetBarbershopController();
  const update = new UpdateBarbershopController();
  const del = new DeleteBarbershopController();
  const getSchedule = new GetScheduleController();
  const updateSchedule = new UpdateScheduleController();
  const logo = new LogoController();

  // Admin — sem checkSubscription (operação de plataforma)
  app.post("/barbershops", { preHandler: [authenticate, authorize(["MASTER_ADMIN"])] }, create.handle.bind(create));
  app.delete("/barbershops/:id", { preHandler: [authenticate, authorize(["MASTER_ADMIN"])] }, del.handle.bind(del));

  // Leitura pública
  app.get("/barbershops", list.handle.bind(list));
  app.get("/barbershops/:id", get.handle.bind(get));
  app.get("/barbershops/:id/schedule", getSchedule.handle.bind(getSchedule));

  // Edição — checkSubscription adicionado
  app.put("/barbershops/:id", { preHandler: [authenticate, authorize(["MASTER_ADMIN", "OWNER"]), checkSubscription] }, update.handle.bind(update));
  app.put("/barbershops/:id/schedule", { preHandler: [authenticate, authorize(["MASTER_ADMIN", "OWNER"]), checkSubscription] }, updateSchedule.handle.bind(updateSchedule));

  // 3. Rotas de logo (adicionar ao final da função, antes do fechamento):

  // Gera signed URL para upload direto no GCS
  // Query: ?mimeType=image/jpeg|image/png
  app.get(
    "/barbershops/:id/logo/upload-url",
    {
      preHandler: [
        authenticate,
        authorize(["MASTER_ADMIN", "OWNER"]),
        checkSubscription,
      ],
    },
    logo.getUploadUrl.bind(logo)
  );

  // Confirma o upload salvando a URL pública no banco
  // Body: { logoUrl: string }
  app.patch(
    "/barbershops/:id/logo",
    {
      preHandler: [
        authenticate,
        authorize(["MASTER_ADMIN", "OWNER"]),
        checkSubscription,
      ],
    },
    logo.confirmLogo.bind(logo)
  );

  // Remove a logo do GCS e limpa o banco
  app.delete(
    "/barbershops/:id/logo",
    {
      preHandler: [
        authenticate,
        authorize(["MASTER_ADMIN", "OWNER"]),
        checkSubscription,
      ],
    },
    logo.deleteLogo.bind(logo)
  );

}