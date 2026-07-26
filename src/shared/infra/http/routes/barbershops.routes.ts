import { FastifyInstance } from "fastify";
import { authenticate }       from "../middlewares/authenticate";
import { authorize }          from "../middlewares/authorize";
import { checkSubscription }  from "../middlewares/checkSubscription";
import { CreateBarbershopController }  from "@/modules/barbershops/useCases/createBarbershop/CreateBarbershopController";
import { ListBarbershopsController }   from "@/modules/barbershops/useCases/listBarbershops/ListBarbershopsController";
import { GetBarbershopController }     from "@/modules/barbershops/useCases/getBarbershop/GetBarbershopController";
import { UpdateBarbershopController }  from "@/modules/barbershops/useCases/updateBarbershop/UpdateBarbershopController";
import { DeleteBarbershopController }  from "@/modules/barbershops/useCases/deleteBarbershop/DeleteBarbershopController";
import { GetScheduleController }       from "@/modules/barbershops/useCases/getSchedule/GetScheduleController";
import { UpdateScheduleController }    from "@/modules/barbershops/useCases/updateSchedule/UpdateScheduleController";
import { LogoController }              from "@/modules/barbershops/useCases/uploadLogo/LogoController";

export async function barbershopsRoutes(app: FastifyInstance) {
  const create         = new CreateBarbershopController();
  const list           = new ListBarbershopsController();
  const get            = new GetBarbershopController();
  const update         = new UpdateBarbershopController();
  const del            = new DeleteBarbershopController();
  const getSchedule    = new GetScheduleController();
  const updateSchedule = new UpdateScheduleController();
  const logo           = new LogoController();

  // ─── Admin — sem checkSubscription (operação de plataforma) ────────────────
  app.post("/barbershops",     { preHandler: [authenticate, authorize(["MASTER_ADMIN"])] }, create.handle.bind(create));
  app.delete("/barbershops/:id", { preHandler: [authenticate, authorize(["MASTER_ADMIN"])] }, del.handle.bind(del));

  // ─── Leitura pública ───────────────────────────────────────────────────────
  app.get("/barbershops",              list.handle.bind(list));
  app.get("/barbershops/:id",          get.handle.bind(get));
  app.get("/barbershops/:id/schedule", getSchedule.handle.bind(getSchedule));

  // ─── Edição com assinatura (PUT e PATCH aceitos — o front usa PATCH) ──────
  app.put("/barbershops/:id",            { preHandler: [authenticate, authorize(["MASTER_ADMIN", "OWNER"]), checkSubscription] }, update.handle.bind(update));
  app.patch("/barbershops/:id",          { preHandler: [authenticate, authorize(["MASTER_ADMIN", "OWNER"]), checkSubscription] }, update.handle.bind(update));
  app.put("/barbershops/:id/schedule",   { preHandler: [authenticate, authorize(["MASTER_ADMIN", "OWNER"]), checkSubscription] }, updateSchedule.handle.bind(updateSchedule));
  app.patch("/barbershops/:id/schedule", { preHandler: [authenticate, authorize(["MASTER_ADMIN", "OWNER"]), checkSubscription] }, updateSchedule.handle.bind(updateSchedule));

  // ─── Logo — Fluxo 1: Signed URL (upload direto cliente → GCS) ─────────────
  //
  // GET  /barbershops/:id/logo/upload-url?mimeType=image/jpeg
  //   → Retorna { uploadUrl, publicUrl, objectName, expiresInSeconds }
  //
  // PUT  {uploadUrl}   ← feito pelo cliente diretamente no GCS
  //   Content-Type: image/jpeg
  //
  // PATCH /barbershops/:id/logo
  //   Body: { logoUrl: "<publicUrl retornado acima>" }
  //   → Confirma e salva no banco
  app.get(
    "/barbershops/:id/logo/upload-url",
    { preHandler: [authenticate, authorize(["MASTER_ADMIN", "OWNER"]), checkSubscription] },
    logo.getUploadUrl.bind(logo)
  );

  app.patch(
    "/barbershops/:id/logo",
    { preHandler: [authenticate, authorize(["MASTER_ADMIN", "OWNER"]), checkSubscription] },
    logo.confirmLogo.bind(logo)
  );

  // ─── Logo — Fluxo 2: Upload direto via multipart (cliente → backend → GCS) ─
  //
  // POST /barbershops/:id/logo/upload
  //   Content-Type: multipart/form-data
  //   Body: campo "logo" com o arquivo (JPEG, PNG ou WebP, max 5 MB)
  //   → Faz upload no GCS e salva logoUrl no banco em uma única requisição
  app.post(
    "/barbershops/:id/logo/upload",
    { preHandler: [authenticate, authorize(["MASTER_ADMIN", "OWNER"]), checkSubscription] },
    logo.uploadDirect.bind(logo)
  );

  // ─── Logo — Remoção ────────────────────────────────────────────────────────
  //
  // DELETE /barbershops/:id/logo
  //   → Remove do GCS e limpa logoUrl no banco
  app.delete(
    "/barbershops/:id/logo",
    { preHandler: [authenticate, authorize(["MASTER_ADMIN", "OWNER"]), checkSubscription] },
    logo.deleteLogo.bind(logo)
  );
}
