import { FastifyInstance, type FastifyRequest } from "fastify";
import { z } from "zod";
import { container } from "tsyringe";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { checkSubscription } from "../middlewares/checkSubscription";
import { setRlsContext } from "../middlewares/setRlsContext";
import { enqueueWhatsApp } from "@/shared/infra/queue";
import { SendAppointmentRemindersUseCase } from "@/modules/appointments/useCases/appointmentUseCases";
import { IBarbershopRepository } from "@/modules/barbershops/repositories/IBarbershopRepository";
import { AppError } from "@/shared/errors/AppError";
import { requireOpenShopWhatsAppInstance } from "@/modules/barbershops/utils/requireOpenShopWhatsApp";
import { prisma } from "@/libs/prismaClient";
import {
  canOwnerConfigureNotification,
  listNotificationPreferences,
} from "@/modules/notifications/services/notificationRegistry";
import { retryNotification } from "@/modules/notifications/services/notificationDeliveryService";

const whatsappBodySchema = z.object({
  phone: z.string().min(8).max(20),
  message: z.string().min(1).max(2000),
  barbershopId: z.string().uuid(),
});

const listSchema = z.object({
  channel: z.enum(["EMAIL", "WHATSAPP"]).optional(),
  status: z.enum([
    "PENDING", "QUEUED", "PROCESSING", "RETRYING", "SENT", "DELIVERED", "READ",
    "FAILED", "BOUNCED", "COMPLAINED", "SUPPRESSED", "SKIPPED", "CANCELED",
  ]).optional(),
  type: z.string().trim().max(80).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  barbershopId: z.string().uuid().optional(),
});

const preferencesSchema = z.object({
  preferences: z.array(z.object({
    channel: z.literal("WHATSAPP"),
    type: z.string().trim().max(80),
    enabled: z.boolean(),
  })).max(50),
});

function ownerShop(user: NonNullable<FastifyRequest["user"]>): string {
  if (!user.barbershopId) throw new AppError("Usuário sem salão vinculado", 403);
  return user.barbershopId;
}

export async function notificationsRoutes(app: FastifyInstance) {
  const staffGuard = [
    authenticate,
    authorize(["MASTER_ADMIN", "OWNER", "EMPLOYEE"]),
    checkSubscription,
    setRlsContext,
  ];

  /** POST /notifications/whatsapp — envio manual pelo staff (ex.: aviso ao cliente). */
  app.post("/notifications/whatsapp", { preHandler: staffGuard }, async (request, reply) => {
    const { phone, message, barbershopId } = whatsappBodySchema.parse(request.body);
    const user = request.user!;

    if (user.role !== "MASTER_ADMIN" && user.barbershopId !== barbershopId) {
      throw new AppError("Acesso negado: você não pertence a este salão", 403);
    }

    const shop = await container
      .resolve<IBarbershopRepository>("BarbershopRepository")
      .findById(barbershopId);
    const instanceName = await requireOpenShopWhatsAppInstance(shop);

    const idempotencyHeader = request.headers["idempotency-key"];
    const idempotencyKey = Array.isArray(idempotencyHeader) ? idempotencyHeader[0] : idempotencyHeader;
    if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 180) {
      throw new AppError("Idempotency-Key obrigatório e inválido", 400);
    }

    const queued = await enqueueWhatsApp({
      phone,
      message,
      instanceName,
      deduplicationKey: `manual:${barbershopId}:${idempotencyKey}`,
      notificationType: "MANUAL",
      barbershopId,
      sourceType: "MANUAL_NOTIFICATION",
      sourceId: idempotencyKey,
    });
    return reply.status(202).send({
      success: true,
      data: {
        deliveryId: queued?.deliveryId ?? null,
        status: queued?.status ?? "QUEUED",
        queued: true,
      },
    });
  });

  const historyGuard = [
    authenticate,
    authorize(["MASTER_ADMIN", "OWNER"]),
    checkSubscription,
    setRlsContext,
  ];

  app.get("/notifications/deliveries", { preHandler: historyGuard }, async (request, reply) => {
    const query = listSchema.parse(request.query);
    const user = request.user!;
    const barbershopId = user.role === "MASTER_ADMIN"
      ? query.barbershopId
      : ownerShop(user);
    const dateRange = query.from || query.to
      ? { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) }
      : undefined;
    const where = {
      ...(barbershopId ? { barbershopId } : {}),
      ...(query.channel ? { channel: query.channel } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(dateRange ? { createdAt: dateRange } : {}),
    };
    const [total, rows] = await Promise.all([
      prisma.notificationDelivery.count({ where }),
      prisma.notificationDelivery.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          id: true,
          barbershopId: true,
          channel: true,
          type: true,
          status: true,
          destinationMasked: true,
          attemptCount: true,
          errorCode: true,
          errorMessage: true,
          createdAt: true,
          queuedAt: true,
          sentAt: true,
          deliveredAt: true,
          readAt: true,
          failedAt: true,
          barbershop: { select: { name: true } },
        },
      }),
    ]);
    return reply.send({
      success: true,
      data: rows.map(({ barbershop, ...row }: (typeof rows)[number]) => ({
        ...row,
        barbershopName: barbershop?.name ?? null,
        lastErrorCode: row.errorCode,
        lastErrorMessage: row.errorMessage,
      })),
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
    });
  });

  app.post(
    "/notifications/deliveries/:id/retry",
    { preHandler: historyGuard },
    async (request, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
      const rawKey = request.headers["idempotency-key"];
      const key = Array.isArray(rawKey) ? rawKey[0] : rawKey;
      if (!key || key.length < 8 || key.length > 180) {
        throw new AppError("Idempotency-Key obrigatório e inválido", 400);
      }
      const delivery = await retryNotification(
        id,
        key,
        request.user!.role === "MASTER_ADMIN" ? undefined : ownerShop(request.user!),
      );
      return reply.status(202).send({
        success: true,
        data: { deliveryId: delivery.id, status: delivery.status, queued: true },
      });
    },
  );

  const preferenceGuard = [authenticate, authorize(["OWNER"]), checkSubscription, setRlsContext];

  app.get("/notifications/preferences", { preHandler: preferenceGuard }, async (request, reply) => {
    const shopId = ownerShop(request.user!);
    const stored = await prisma.notificationPreference.findMany({ where: { barbershopId: shopId } });
    const values = new Map(stored.map((item: (typeof stored)[number]) => [`${item.channel}:${item.type}`, item.enabled]));
    const preferences = listNotificationPreferences().map((item) => ({
      channel: item.channel,
      type: item.type,
      label: item.label,
      enabled: values.get(`${item.channel}:${item.type}`) ?? item.defaultEnabled,
    }));
    return reply.send({ success: true, data: { preferences } });
  });

  app.patch("/notifications/preferences", { preHandler: preferenceGuard }, async (request, reply) => {
    const shopId = ownerShop(request.user!);
    const { preferences } = preferencesSchema.parse(request.body);
    if (preferences.some((item) => !canOwnerConfigureNotification(item.type))) {
      throw new AppError("Tipo de notificação não configurável", 400);
    }
    await prisma.$transaction(preferences.map((item) => prisma.notificationPreference.upsert({
      where: {
        barbershopId_channel_type: {
          barbershopId: shopId,
          channel: item.channel,
          type: item.type,
        },
      },
      create: { barbershopId: shopId, ...item },
      update: { enabled: item.enabled },
    })));
    const stored = await prisma.notificationPreference.findMany({ where: { barbershopId: shopId } });
    const values = new Map(stored.map((item: (typeof stored)[number]) => [`${item.channel}:${item.type}`, item.enabled]));
    const result = listNotificationPreferences().map((item) => ({
      channel: item.channel,
      type: item.type,
      label: item.label,
      enabled: values.get(`${item.channel}:${item.type}`) ?? item.defaultEnabled,
    }));
    return reply.send({ success: true, data: { preferences: result } });
  });

  /**
   * POST /notifications/appointment-reminders/run
   * Disparo manual do job de lembretes (debug/produção sem esperar o cron).
   * Apenas MASTER_ADMIN.
   */
  app.post(
    "/notifications/appointment-reminders/run",
    { preHandler: [authenticate, authorize(["MASTER_ADMIN"]), setRlsContext] },
    async (_request, reply) => {
      const useCase = container.resolve(SendAppointmentRemindersUseCase);
      const result = await useCase.execute();
      return reply.send({ success: true, data: result });
    }
  );
}
