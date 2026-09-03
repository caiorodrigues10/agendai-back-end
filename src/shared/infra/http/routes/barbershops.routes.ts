import { FastifyInstance } from "fastify";
import { authenticate }       from "../middlewares/authenticate";
import { authorize }          from "../middlewares/authorize";
import { checkSubscription }  from "../middlewares/checkSubscription";
import { setRlsContext }      from "../middlewares/setRlsContext";
import { CreateBarbershopController }  from "@/modules/barbershops/useCases/createBarbershop/CreateBarbershopController";
import { ListBarbershopsController }   from "@/modules/barbershops/useCases/listBarbershops/ListBarbershopsController";
import { GetBarbershopController }     from "@/modules/barbershops/useCases/getBarbershop/GetBarbershopController";
import { UpdateBarbershopController }  from "@/modules/barbershops/useCases/updateBarbershop/UpdateBarbershopController";
import { DeleteBarbershopController }  from "@/modules/barbershops/useCases/deleteBarbershop/DeleteBarbershopController";
import { GetScheduleController }       from "@/modules/barbershops/useCases/getSchedule/GetScheduleController";
import { UpdateScheduleController }    from "@/modules/barbershops/useCases/updateSchedule/UpdateScheduleController";
import { LogoController }              from "@/modules/barbershops/useCases/uploadLogo/LogoController";
import { WhatsAppConnectionController } from "@/modules/barbershops/useCases/whatsappConnection/WhatsAppConnectionController";
import { ChangeOperationModeController } from "@/modules/barbershops/useCases/changeOperationMode/ChangeOperationModeController";
import { ShopStatusController } from "@/modules/barbershops/useCases/shopStatus/ShopStatusController";
import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import { z } from "zod";
import { enqueueWhatsApp } from "@/shared/infra/queue";

export async function barbershopsRoutes(app: FastifyInstance) {
  const create         = new CreateBarbershopController();
  const list           = new ListBarbershopsController();
  const get            = new GetBarbershopController();
  const update         = new UpdateBarbershopController();
  const del            = new DeleteBarbershopController();
  const getSchedule    = new GetScheduleController();
  const updateSchedule = new UpdateScheduleController();
  const logo           = new LogoController();
  const whatsapp       = new WhatsAppConnectionController();
  const changeMode     = new ChangeOperationModeController();
  const shopStatus     = new ShopStatusController();
  const assertOwnShop = (request: { user?: { role?: string; barbershopId?: string } }, id: string) => {
    if (request.user?.role !== "MASTER_ADMIN" && request.user?.barbershopId !== id) throw new AppError("Acesso negado", 403);
  };

  // ─── Admin — sem checkSubscription (operação de plataforma) ────────────────
  app.post("/barbershops",     { preHandler: [authenticate, authorize(["MASTER_ADMIN"]), setRlsContext] }, create.handle.bind(create));
  app.delete("/barbershops/:id", { preHandler: [authenticate, authorize(["MASTER_ADMIN"]), setRlsContext] }, del.handle.bind(del));

  // ─── Leitura pública ───────────────────────────────────────────────────────
  app.get("/barbershops",              list.handle.bind(list));
  app.get("/barbershops/:id",          get.handle.bind(get));
  app.get("/barbershops/:id/schedule", getSchedule.handle.bind(getSchedule));
  app.get("/barbershops/:id/staff",    get.listStaff.bind(get));

  // ─── Edição com assinatura (PUT e PATCH aceitos — o front usa PATCH) ──────
  app.put("/barbershops/:id",            { preHandler: [authenticate, authorize(["MASTER_ADMIN", "OWNER"]), checkSubscription, setRlsContext] }, update.handle.bind(update));
  app.patch("/barbershops/:id",          { preHandler: [authenticate, authorize(["MASTER_ADMIN", "OWNER"]), checkSubscription, setRlsContext] }, update.handle.bind(update));
  app.put("/barbershops/:id/schedule",   { preHandler: [authenticate, authorize(["MASTER_ADMIN", "OWNER"]), checkSubscription, setRlsContext] }, updateSchedule.handle.bind(updateSchedule));
  app.patch("/barbershops/:id/schedule", { preHandler: [authenticate, authorize(["MASTER_ADMIN", "OWNER"]), checkSubscription, setRlsContext] }, updateSchedule.handle.bind(updateSchedule));

  const ownerWhatsAppGuard = [
    authenticate,
    authorize(["MASTER_ADMIN", "OWNER"]),
    checkSubscription,
    setRlsContext,
  ];
  app.get("/barbershops/:id/whatsapp", { preHandler: ownerWhatsAppGuard }, whatsapp.status.bind(whatsapp));
  app.post("/barbershops/:id/whatsapp/connect", { preHandler: ownerWhatsAppGuard }, whatsapp.connect.bind(whatsapp));
  app.post("/barbershops/:id/whatsapp/disconnect", { preHandler: ownerWhatsAppGuard }, whatsapp.disconnect.bind(whatsapp));

  app.get("/barbershops/:id/queue-alert", { preHandler: ownerWhatsAppGuard }, async (request, reply) => {
    const { id } = request.params as { id: string };
    assertOwnShop(request, id);
    const shop = await prisma.barbershop.findUnique({ where: { id }, select: { queueAlertEnabled: true, queueAlertThreshold: true, queueAlertPhone: true, whatsapp: true, evolutionInstanceName: true, operationMode: true } });
    if (!shop) throw new AppError("Salão não encontrado", 404);
    const currentWaiting = await prisma.queueItem.count({ where: { barbershopId: id, status: "WAITING" } });
    return reply.send({ success: true, data: { enabled: shop.queueAlertEnabled, threshold: shop.queueAlertThreshold, phone: shop.queueAlertPhone || shop.whatsapp, currentWaiting, exceeded: currentWaiting > shop.queueAlertThreshold, whatsappConnected: Boolean(shop.evolutionInstanceName?.trim() || process.env.EVOLUTION_INSTANCE_NAME?.trim()), queueEnabled: shop.operationMode !== "APPOINTMENTS_ONLY" } });
  });

  app.patch("/barbershops/:id/queue-alert", { preHandler: ownerWhatsAppGuard }, async (request, reply) => {
    const { id } = request.params as { id: string };
    assertOwnShop(request, id);
    const body = z.object({ enabled: z.boolean(), threshold: z.number().int().min(1).max(100), phone: z.string().max(20).optional().nullable() }).parse(request.body);
    const phone = body.phone?.replace(/\D/g, "") || null;
    if (body.enabled && (!phone || phone.length < 10 || phone.length > 13)) throw new AppError("Informe um WhatsApp válido para receber o alerta.", 400);
    const shop = await prisma.barbershop.update({ where: { id }, data: { queueAlertEnabled: body.enabled, queueAlertThreshold: body.threshold, queueAlertPhone: phone, queueAlertUpdatedAt: new Date() }, select: { queueAlertEnabled: true, queueAlertThreshold: true, queueAlertPhone: true } });
    return reply.send({ success: true, data: { enabled: shop.queueAlertEnabled, threshold: shop.queueAlertThreshold, phone: shop.queueAlertPhone } });
  });

  app.post("/barbershops/:id/queue-alert/test", { preHandler: ownerWhatsAppGuard }, async (request, reply) => {
    const { id } = request.params as { id: string };
    assertOwnShop(request, id);
    const shop = await prisma.barbershop.findUnique({ where: { id }, select: { name: true, whatsapp: true, queueAlertPhone: true, evolutionInstanceName: true } });
    const destination = shop?.queueAlertPhone || shop?.whatsapp;
    const instanceName = shop?.evolutionInstanceName?.trim() || process.env.EVOLUTION_INSTANCE_NAME?.trim();
    if (!shop || !destination || !instanceName) throw new AppError("Configure e conecte o WhatsApp antes de enviar o teste.", 400);
    await enqueueWhatsApp({ phone: destination, instanceName, barbershopId: id, sourceType: "QUEUE_CAPACITY_TEST", deduplicationKey: `queue-capacity-test:${id}:${Date.now()}`, notificationType: "QUEUE_CAPACITY_ALERT", message: `✅ *Teste de alerta de fila*\n\nO alerta de fila cheia do *${shop.name}* está configurado corretamente.` });
    return reply.send({ success: true, data: { sent: true } });
  });

  // ─── Modo de atendimento ─────────────────────────────────────────────────
  app.patch(
    "/barbershops/:id/operation-mode",
    { preHandler: [authenticate, authorize(["MASTER_ADMIN", "OWNER"]), checkSubscription, setRlsContext] },
    changeMode.handle.bind(changeMode)
  );

  const ownerFloorGuard = [
    authenticate,
    authorize(["MASTER_ADMIN", "OWNER"]),
    checkSubscription,
    setRlsContext,
  ];
  app.patch("/barbershops/:id/manual-status", { preHandler: ownerFloorGuard }, shopStatus.setManualStatus.bind(shopStatus));
  app.patch("/barbershops/:id/queue-status", { preHandler: ownerFloorGuard }, shopStatus.setQueueStatus.bind(shopStatus));

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
    { preHandler: [authenticate, authorize(["MASTER_ADMIN", "OWNER"]), checkSubscription, setRlsContext] },
    logo.getUploadUrl.bind(logo)
  );

  app.patch(
    "/barbershops/:id/logo",
    { preHandler: [authenticate, authorize(["MASTER_ADMIN", "OWNER"]), checkSubscription, setRlsContext] },
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
    { preHandler: [authenticate, authorize(["MASTER_ADMIN", "OWNER"]), checkSubscription, setRlsContext] },
    logo.uploadDirect.bind(logo)
  );

  // ─── Logo — Remoção ────────────────────────────────────────────────────────
  //
  // DELETE /barbershops/:id/logo
  //   → Remove do GCS e limpa logoUrl no banco
  app.delete(
    "/barbershops/:id/logo",
    { preHandler: [authenticate, authorize(["MASTER_ADMIN", "OWNER"]), checkSubscription, setRlsContext] },
    logo.deleteLogo.bind(logo)
  );
}
