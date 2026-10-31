import { FastifyRequest, FastifyReply } from "fastify";
import { Queue } from "bullmq";
import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import { getRedisConnection } from "@/shared/infra/queue/redisConnection";
import { getPlatformWhatsAppSettings, updatePlatformWhatsAppSettings } from "@/shared/services/platformWhatsAppSettings";
import { fetchEvolutionConnectionState, fetchEvolutionQr, logoutEvolutionInstance, createEvolutionInstance } from "@/shared/services/evolutionApiService";
import { maskPhone } from "@/modules/whatsappOwnerBot/messages";
import { getModuleLogger } from "@/shared/utils/logger";

const logger = getModuleLogger("admin:whatsapp");

function maskPhoneGeneric(phone: string | null | undefined): string | null {
  if (!phone) return null;
  return phone.replace(/(\d{2})\d+(\d{2})/, "$1***$2");
}

export class AdminWhatsAppController {
  // ─── overview ────────────────────────────────────────────────────────────
  async overview(_request: FastifyRequest, reply: FastifyReply) {
    const settings = await getPlatformWhatsAppSettings();
    const aiInstance = process.env.EVOLUTION_AI_INSTANCE_NAME?.trim() || null;
    const platformInstance = process.env.EVOLUTION_INSTANCE_NAME?.trim() || null;

    const [aiState, platformState] = await Promise.all([
      aiInstance ? fetchEvolutionConnectionState(aiInstance).catch(() => "close" as const) : Promise.resolve(null),
      platformInstance ? fetchEvolutionConnectionState(platformInstance).catch(() => "close" as const) : Promise.resolve(null),
    ]);

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [aiConvCount, aiMsgCount24h, ownerActions24h, shopsWithAi, shopsWithOwnerBot] = await Promise.all([
      prisma.aiConversation.count(),
      prisma.aiMessage.count({ where: { sentAt: { gte: since24h } } }),
      prisma.ownerBotActionLog.count({ where: { createdAt: { gte: since24h } } }),
      prisma.barbershop.count({ where: { whatsappAiEnabled: true } }),
      prisma.ownerBotPreference.count({ where: { enabled: true, blocked: false } }),
    ]);

    const queues = await this.queueCounts(["whatsapp", "whatsapp-ai", "owner-bot"]);

    return reply.send({
      success: true,
      data: {
        generatedAt: new Date().toISOString(),
        globalSettings: settings,
        instances: {
          ai: { name: aiInstance, state: aiState },
          platform: { name: platformInstance, state: platformState },
        },
        counts: {
          shopsWithAiEnabled: shopsWithAi,
          shopsWithOwnerBotEnabled: shopsWithOwnerBot,
          aiConversationsTotal: aiConvCount,
          aiMessages24h: aiMsgCount24h,
          ownerBotActions24h: ownerActions24h,
        },
        queues,
      },
    });
  }

  async instances(_request: FastifyRequest, reply: FastifyReply) {
    const aiInstance = process.env.EVOLUTION_AI_INSTANCE_NAME?.trim() || null;
    const platformInstance = process.env.EVOLUTION_INSTANCE_NAME?.trim() || null;

    const shops = await prisma.barbershop.findMany({
      select: { id: true, name: true, evolutionInstanceName: true },
      take: 200,
    });

    const result: any[] = [];
    if (aiInstance) {
      result.push({ kind: "ai", name: aiInstance, state: await safeState(aiInstance) });
    }
    if (platformInstance) {
      result.push({ kind: "platform", name: platformInstance, state: await safeState(platformInstance) });
    }
    for (const shop of shops) {
      const name = shop.evolutionInstanceName?.trim();
      if (!name) continue;
      result.push({ kind: "shop", shopId: shop.id, shopName: shop.name, name, state: await safeState(name) });
    }

    return reply.send({ success: true, data: result });
  }

  async platformSettingsGet(_request: FastifyRequest, reply: FastifyReply) {
    const settings = await getPlatformWhatsAppSettings();
    return reply.send({ success: true, data: settings });
  }

  async platformSettingsPut(request: FastifyRequest, reply: FastifyReply) {
    const body = request.body as any;
    const reason = body?.reason;
    if (typeof reason !== "string" || reason.trim().length < 10) {
      throw new AppError("Informe um motivo com pelo menos 10 caracteres", 400);
    }
    const user = request.user as any;
    const updated = await updatePlatformWhatsAppSettings({
      aiGloballyEnabled: body?.aiGloballyEnabled,
      ownerBotGloballyEnabled: body?.ownerBotGloballyEnabled,
      outboundPaused: body?.outboundPaused,
      reason: reason.trim(),
      updatedBy: user?.id ?? null,
    });

    await prisma.auditLog.create({
      data: {
        userId: user?.id,
        action: "WHATSAPP_PLATFORM_SETTINGS_UPDATE",
        resource: "PlatformWhatsAppSetting",
        resourceId: "global",
        details: JSON.stringify({ reason, after: updated }),
        ipAddress: request.ip,
      },
    });

    return reply.send({ success: true, data: updated });
  }

  // ─── shops ───────────────────────────────────────────────────────────────
  async shops(request: FastifyRequest, reply: FastifyReply) {
    const query = request.query as any;
    const page = Math.max(1, Number(query?.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query?.limit) || 20));
    const search = query?.search ? String(query.search) : undefined;

    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { city: { contains: search, mode: "insensitive" } },
      ];
    }
    if (query?.aiEnabled === "true") where.whatsappAiEnabled = true;
    if (query?.aiEnabled === "false") where.whatsappAiEnabled = false;

    const [shops, total] = await Promise.all([
      prisma.barbershop.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          city: true,
          active: true,
          approvalStatus: true,
          whatsappAiEnabled: true,
          evolutionInstanceName: true,
          createdAt: true,
          OwnerBotPreference: { select: { enabled: true, blocked: true, blockedAt: true } },
          _count: { select: { aiConversations: true, OwnerBotActionLog: true } },
        },
      }),
      prisma.barbershop.count({ where }),
    ]);

    const data = shops.map((s: any) => ({
      id: s.id,
      name: s.name,
      city: s.city,
      active: s.active,
      approvalStatus: s.approvalStatus,
      whatsappAiEnabled: s.whatsappAiEnabled,
      evolutionInstanceName: s.evolutionInstanceName,
      ownerBot: s.OwnerBotPreference
        ? { enabled: s.OwnerBotPreference.enabled, blocked: s.OwnerBotPreference.blocked, blockedAt: s.OwnerBotPreference.blockedAt }
        : null,
      counts: s._count,
    }));

    return reply.send({ success: true, data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } });
  }

  async batchPatchShopAi(request: FastifyRequest, reply: FastifyReply) {
    const body = request.body as any;
    const reason = body?.reason;
    if (typeof reason !== "string" || reason.trim().length < 10) {
      throw new AppError("Informe um motivo com pelo menos 10 caracteres", 400);
    }
    const ids: string[] = Array.isArray(body?.ids) ? body.ids : [];
    if (ids.length === 0 || ids.length > 50) throw new AppError("Informe entre 1 e 50 ids", 400);
    const enabled = Boolean(body?.enabled);

    await prisma.barbershop.updateMany({
      where: { id: { in: ids } },
      data: { whatsappAiEnabled: enabled },
    });

    const user = request.user as any;
    await prisma.auditLog.create({
      data: {
        userId: user?.id,
        action: "WHATSAPP_AI_BATCH_TOGGLE",
        resource: "Barbershop",
        resourceId: ids.join(","),
        details: JSON.stringify({ reason, enabled, count: ids.length }),
        ipAddress: request.ip,
      },
    });

    return reply.send({ success: true, data: { updated: ids.length } });
  }

  async patchShopAi(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const reason = body?.reason;
    if (typeof reason !== "string" || reason.trim().length < 10) {
      throw new AppError("Informe um motivo com pelo menos 10 caracteres", 400);
    }
    const enabled = Boolean(body?.enabled);
    const shop = await prisma.barbershop.findUnique({ where: { id } });
    if (!shop) throw new AppError("Conta não encontrada", 404);

    const updated = await prisma.barbershop.update({
      where: { id },
      data: { whatsappAiEnabled: enabled },
      select: { id: true, name: true, whatsappAiEnabled: true },
    });

    const user = request.user as any;
    await prisma.auditLog.create({
      data: {
        userId: user?.id,
        action: "WHATSAPP_AI_TOGGLE",
        resource: "Barbershop",
        resourceId: id,
        details: JSON.stringify({ reason, before: shop.whatsappAiEnabled, after: enabled }),
        ipAddress: request.ip,
        barbershopId: id,
      },
    });

    return reply.send({ success: true, data: updated });
  }

  async batchPatchShopOwnerBot(request: FastifyRequest, reply: FastifyReply) {
    const body = request.body as any;
    const reason = body?.reason;
    if (typeof reason !== "string" || reason.trim().length < 10) {
      throw new AppError("Informe um motivo com pelo menos 10 caracteres", 400);
    }
    const ids: string[] = Array.isArray(body?.ids) ? body.ids : [];
    if (ids.length === 0 || ids.length > 50) throw new AppError("Informe entre 1 e 50 ids", 400);

    const enabled = body?.enabled !== undefined ? Boolean(body.enabled) : undefined;
    const blocked = body?.blocked !== undefined ? Boolean(body.blocked) : undefined;

    for (const id of ids) {
      await prisma.ownerBotPreference.upsert({
        where: { barbershopId: id },
        create: {
          barbershopId: id,
          enabled: enabled ?? true,
          blocked: blocked ?? false,
          blockedAt: blocked ? new Date() : null,
        },
        update: {
          ...(enabled !== undefined && { enabled }),
          ...(blocked !== undefined && { blocked, blockedAt: blocked ? new Date() : null }),
        },
      });
    }

    const user = request.user as any;
    await prisma.auditLog.create({
      data: {
        userId: user?.id,
        action: "WHATSAPP_OWNER_BOT_BATCH_TOGGLE",
        resource: "Barbershop",
        resourceId: ids.join(","),
        details: JSON.stringify({ reason, enabled, blocked, count: ids.length }),
        ipAddress: request.ip,
      },
    });

    return reply.send({ success: true, data: { updated: ids.length } });
  }

  async patchShopOwnerBot(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const reason = body?.reason;
    if (typeof reason !== "string" || reason.trim().length < 10) {
      throw new AppError("Informe um motivo com pelo menos 10 caracteres", 400);
    }
    const shop = await prisma.barbershop.findUnique({ where: { id } });
    if (!shop) throw new AppError("Conta não encontrada", 404);

    const enabled = body?.enabled !== undefined ? Boolean(body.enabled) : undefined;
    const blocked = body?.blocked !== undefined ? Boolean(body.blocked) : undefined;
    const revokeLinks = Boolean(body?.revokeLinks);

    const pref = await prisma.ownerBotPreference.upsert({
      where: { barbershopId: id },
      create: {
        barbershopId: id,
        enabled: enabled ?? true,
        blocked: blocked ?? false,
        blockedAt: blocked ? new Date() : null,
      },
      update: {
        ...(enabled !== undefined && { enabled }),
        ...(blocked !== undefined && { blocked, blockedAt: blocked ? new Date() : null }),
      },
    });

    if (revokeLinks) {
      await prisma.ownerBotLink.updateMany({
        where: { barbershopId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    const user = request.user as any;
    await prisma.auditLog.create({
      data: {
        userId: user?.id,
        action: "WHATSAPP_OWNER_BOT_TOGGLE",
        resource: "Barbershop",
        resourceId: id,
        details: JSON.stringify({ reason, enabled, blocked, revokeLinks }),
        ipAddress: request.ip,
        barbershopId: id,
      },
    });

    return reply.send({ success: true, data: pref });
  }

  async shopInstanceReconnect(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const reason = body?.reason;
    if (typeof reason !== "string" || reason.trim().length < 10) {
      throw new AppError("Informe um motivo com pelo menos 10 caracteres", 400);
    }
    const shop = await prisma.barbershop.findUnique({ where: { id } });
    if (!shop) throw new AppError("Conta não encontrada", 404);
    const instanceName = shop.evolutionInstanceName?.trim();
    if (!instanceName) throw new AppError("Salão sem instância configurada", 400);

    try {
      await createEvolutionInstance(instanceName, { qrcode: true });
    } catch (err) {
      logger.warn({ err }, "reconnect create failed");
    }
    const state = await fetchEvolutionConnectionState(instanceName).catch(() => "close");

    const user = request.user as any;
    await prisma.auditLog.create({
      data: {
        userId: user?.id,
        action: "WHATSAPP_INSTANCE_RECONNECT",
        resource: "Barbershop",
        resourceId: id,
        details: JSON.stringify({ reason, instanceName, state }),
        ipAddress: request.ip,
        barbershopId: id,
      },
    });

    return reply.send({ success: true, data: { instanceName, state } });
  }

  async shopInstanceLogout(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const reason = body?.reason;
    if (typeof reason !== "string" || reason.trim().length < 10) {
      throw new AppError("Informe um motivo com pelo menos 10 caracteres", 400);
    }
    const shop = await prisma.barbershop.findUnique({ where: { id } });
    if (!shop) throw new AppError("Conta não encontrada", 404);
    const instanceName = shop.evolutionInstanceName?.trim();
    if (!instanceName) throw new AppError("Salão sem instância configurada", 400);

    await logoutEvolutionInstance(instanceName).catch(() => undefined);
    const state = await fetchEvolutionConnectionState(instanceName).catch(() => "close");

    const user = request.user as any;
    await prisma.auditLog.create({
      data: {
        userId: user?.id,
        action: "WHATSAPP_INSTANCE_LOGOUT",
        resource: "Barbershop",
        resourceId: id,
        details: JSON.stringify({ reason, instanceName, state }),
        ipAddress: request.ip,
        barbershopId: id,
      },
    });

    return reply.send({ success: true, data: { instanceName, state } });
  }

  // ─── AI conversations cross-tenant ───────────────────────────────────────
  async aiConversations(request: FastifyRequest, reply: FastifyReply) {
    const query = request.query as any;
    const page = Math.max(1, Number(query?.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query?.limit) || 20));
    const barbershopId = query?.barbershopId ? String(query.barbershopId) : undefined;

    const where: any = {};
    if (barbershopId) where.barbershopId = barbershopId;
    if (query?.status) where.status = query.status;

    const [convs, total] = await Promise.all([
      prisma.aiConversation.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { lastMessageAt: "desc" },
        select: {
          id: true,
          barbershopId: true,
          phone: true,
          normalizedPhone: true,
          status: true,
          startedAt: true,
          lastMessageAt: true,
          endedAt: true,
          barbershop: { select: { name: true } },
          _count: { select: { messages: true } },
        },
      }),
      prisma.aiConversation.count({ where }),
    ]);

    const data = convs.map((c: any) => ({
      id: c.id,
      barbershopId: c.barbershopId,
      barbershopName: c.barbershop?.name,
      phoneMasked: maskPhoneGeneric(c.phone),
      status: c.status,
      startedAt: c.startedAt,
      lastMessageAt: c.lastMessageAt,
      endedAt: c.endedAt,
      messageCount: c._count.messages,
    }));

    return reply.send({ success: true, data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } });
  }

  async aiConversationDetail(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const conv = await prisma.aiConversation.findUnique({
      where: { id },
      include: {
        messages: { orderBy: { sentAt: "asc" }, take: 200 },
        barbershop: { select: { id: true, name: true } },
      },
    });
    if (!conv) throw new AppError("Conversa não encontrada", 404);

    return reply.send({
      success: true,
      data: {
        id: conv.id,
        barbershopId: conv.barbershopId,
        barbershopName: conv.barbershop?.name,
        phoneMasked: maskPhoneGeneric(conv.phone),
        status: conv.status,
        context: conv.context,
        startedAt: conv.startedAt,
        lastMessageAt: conv.lastMessageAt,
        endedAt: conv.endedAt,
        messages: conv.messages.map((m: any) => ({
          id: m.id,
          direction: m.direction,
          content: m.content,
          messageType: m.messageType,
          intent: m.intent,
          confidence: m.confidence,
          sentAt: m.sentAt,
        })),
      },
    });
  }

  async aiTransfer(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const reason = body?.reason;
    if (typeof reason !== "string" || reason.trim().length < 10) {
      throw new AppError("Informe um motivo com pelo menos 10 caracteres", 400);
    }
    const conv = await prisma.aiConversation.findUnique({ where: { id } });
    if (!conv) throw new AppError("Conversa não encontrada", 404);

    const updated = await prisma.aiConversation.update({
      where: { id },
      data: { status: "TRANSFERRED_TO_HUMAN", endedAt: new Date() },
    });

    const user = request.user as any;
    await prisma.auditLog.create({
      data: {
        userId: user?.id,
        action: "WHATSAPP_AI_TRANSFER",
        resource: "AiConversation",
        resourceId: id,
        details: JSON.stringify({ reason, barbershopId: conv.barbershopId }),
        ipAddress: request.ip,
        barbershopId: conv.barbershopId,
      },
    });

    return reply.send({ success: true, data: updated });
  }

  // ─── owner bot action logs ───────────────────────────────────────────────
  async ownerBotActionLogs(request: FastifyRequest, reply: FastifyReply) {
    const query = request.query as any;
    const page = Math.max(1, Number(query?.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query?.limit) || 20));
    const barbershopId = query?.barbershopId ? String(query.barbershopId) : undefined;

    const where: any = {};
    if (barbershopId) where.barbershopId = barbershopId;
    if (query?.riskClass) where.riskClass = query.riskClass;
    if (query?.status) where.status = query.status;

    const [logs, total] = await Promise.all([
      prisma.ownerBotActionLog.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          barbershopId: true,
          action: true,
          status: true,
          riskClass: true,
          phoneMasked: true,
          errorMessage: true,
          canUndo: true,
          undoneAt: true,
          createdAt: true,
          barbershop: { select: { name: true } },
        },
      }),
      prisma.ownerBotActionLog.count({ where }),
    ]);

    const data = logs.map((l: any) => ({
      ...l,
      barbershopName: l.barbershop?.name,
    }));

    return reply.send({ success: true, data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } });
  }

  // ─── notification delivery / outbox retry ───────────────────────────────
  async failedNotifications(_request: FastifyRequest, reply: FastifyReply) {
    const deliveries = await prisma.notificationDelivery.findMany({
      where: { status: { in: ["FAILED", "BOUNCED", "COMPLAINED", "SUPPRESSED"] } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, barbershopId: true, channel: true, type: true, status: true, errorCode: true, errorMessage: true, createdAt: true },
    });
    const outbox = await prisma.notificationOutbox.findMany({
      where: { status: "FAILED" },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, deliveryId: true, status: true, lastError: true, publishAttempts: true, createdAt: true },
    });
    return reply.send({ success: true, data: { deliveries, outbox } });
  }

  async retryDelivery(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const reason = body?.reason;
    if (typeof reason !== "string" || reason.trim().length < 10) throw new AppError("Informe um motivo com pelo menos 10 caracteres", 400);

    const delivery = await prisma.notificationDelivery.findUnique({ where: { id } });
    if (!delivery) throw new AppError("Entrega não encontrada", 404);

    await prisma.notificationDelivery.update({
      where: { id },
      data: { status: "PENDING", failedAt: null },
    });
    if (delivery.id) {
      await prisma.notificationOutbox.updateMany({
        where: { deliveryId: id },
        data: { status: "PENDING", nextAttemptAt: new Date(), lastError: null },
      });
    }

    const user = request.user as any;
    await prisma.auditLog.create({
      data: {
        userId: user?.id,
        action: "WHATSAPP_NOTIFICATION_RETRY",
        resource: "NotificationDelivery",
        resourceId: id,
        details: JSON.stringify({ reason }),
        ipAddress: request.ip,
        barbershopId: delivery.barbershopId ?? undefined,
      },
    });

    return reply.send({ success: true, data: { id, retried: true } });
  }

  async retryOutbox(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const reason = body?.reason;
    if (typeof reason !== "string" || reason.trim().length < 10) throw new AppError("Informe um motivo com pelo menos 10 caracteres", 400);

    const row = await prisma.notificationOutbox.findUnique({ where: { id } });
    if (!row) throw new AppError("Outbox não encontrado", 404);

    await prisma.notificationOutbox.update({
      where: { id },
      data: { status: "PENDING", nextAttemptAt: new Date(), lastError: null },
    });

    const user = request.user as any;
    await prisma.auditLog.create({
      data: {
        userId: user?.id,
        action: "WHATSAPP_OUTBOX_RETRY",
        resource: "NotificationOutbox",
        resourceId: id,
        details: JSON.stringify({ reason }),
        ipAddress: request.ip,
      },
    });

    return reply.send({ success: true, data: { id, retried: true } });
  }

  // ─── queues ──────────────────────────────────────────────────────────────
  async queues(_request: FastifyRequest, reply: FastifyReply) {
    const counts = await this.queueCounts(["whatsapp", "whatsapp-ai", "owner-bot"]);
    // failed jobs details for each
    const failedDetails: Record<string, any[]> = {};
    for (const name of ["whatsapp", "whatsapp-ai", "owner-bot"]) {
      try {
        const q = new Queue(name, { connection: getRedisConnection() });
        const failed = await q.getFailed(0, 20);
        failedDetails[name] = failed.map((j) => ({
          id: j.id,
          name: j.name,
          data: j.data,
          failedReason: j.failedReason,
          attemptsMade: j.attemptsMade,
          timestamp: j.timestamp,
        }));
        await q.close();
      } catch (err) {
        failedDetails[name] = [];
      }
    }
    return reply.send({ success: true, data: { counts, failed: failedDetails } });
  }

  async reprocessJob(request: FastifyRequest, reply: FastifyReply) {
    const body = request.body as any;
    const reason = body?.reason;
    if (typeof reason !== "string" || reason.trim().length < 10) {
      throw new AppError("Informe um motivo com pelo menos 10 caracteres", 400);
    }
    const queueName = String((request.params as any)?.queue || body?.queue || "");
    const jobId = String((request.params as any)?.jobId || body?.jobId || "");
    if (!["whatsapp", "whatsapp-ai", "owner-bot"].includes(queueName)) {
      throw new AppError("Fila inválida", 400);
    }
    if (!jobId) throw new AppError("jobId obrigatório", 400);

    const q = new Queue(queueName, { connection: getRedisConnection() });
    const job = await q.getJob(jobId);
    if (!job) {
      await q.close();
      throw new AppError("Job não encontrado", 404);
    }
    await job.retry();
    await q.close();

    const user = request.user as any;
    await prisma.auditLog.create({
      data: {
        userId: user?.id,
        action: "WHATSAPP_QUEUE_REPROCESS",
        resource: "QueueJob",
        resourceId: jobId,
        details: JSON.stringify({ reason, queue: queueName }),
        ipAddress: request.ip,
      },
    });

    return reply.send({ success: true, data: { queue: queueName, jobId, reprocessed: true } });
  }

  async cleanJob(request: FastifyRequest, reply: FastifyReply) {
    const body = request.body as any;
    const reason = body?.reason;
    if (typeof reason !== "string" || reason.trim().length < 10) {
      throw new AppError("Informe um motivo com pelo menos 10 caracteres", 400);
    }
    const queueName = String((request.params as any)?.queue || body?.queue || "");
    const jobId = String((request.params as any)?.jobId || body?.jobId || "");
    if (!["whatsapp", "whatsapp-ai", "owner-bot"].includes(queueName)) {
      throw new AppError("Fila inválida", 400);
    }
    if (!jobId) throw new AppError("jobId obrigatório", 400);

    const q = new Queue(queueName, { connection: getRedisConnection() });
    const job = await q.getJob(jobId);
    if (job) await job.remove();
    await q.close();

    const user = request.user as any;
    await prisma.auditLog.create({
      data: {
        userId: user?.id,
        action: "WHATSAPP_QUEUE_CLEAN",
        resource: "QueueJob",
        resourceId: jobId,
        details: JSON.stringify({ reason, queue: queueName }),
        ipAddress: request.ip,
      },
    });

    return reply.send({ success: true, data: { queue: queueName, jobId, removed: true } });
  }

  private async queueCounts(names: string[]): Promise<Record<string, any>> {
    const out: Record<string, any> = {};
    for (const name of names) {
      try {
        const q = new Queue(name, { connection: getRedisConnection() });
        const counts = await q.getJobCounts("wait", "active", "completed", "failed", "delayed");
        out[name] = counts;
        await q.close();
      } catch {
        out[name] = null;
      }
    }
    return out;
  }
}

async function safeState(name: string) {
  try {
    return await fetchEvolutionConnectionState(name);
  } catch {
    return "close";
  }
}
