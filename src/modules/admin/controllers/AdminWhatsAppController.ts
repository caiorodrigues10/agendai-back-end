import { FastifyRequest, FastifyReply } from "fastify";
import {
  whatsappBatchAiSchema,
  whatsappBatchOwnerBotSchema,
  whatsappInstanceReasonSchema,
  whatsappPaginationQuerySchema,
  whatsappPatchShopAiSchema,
  whatsappPatchShopOwnerBotSchema,
  whatsappPlatformSettingsPutSchema,
  whatsappReasonSchema,
} from "../schemas/adminWhatsAppSchemas";
import { PlatformWhatsAppSettingsRepository } from "../repositories/PlatformWhatsAppSettingsRepository";
import { AdminWhatsAppNotificationRepository } from "../repositories/AdminWhatsAppNotificationRepository";
import { AdminWhatsAppAuditRepository } from "../repositories/AdminWhatsAppAuditRepository";
import { AdminWhatsAppOverviewRepository } from "../repositories/AdminWhatsAppOverviewRepository";
import { AdminWhatsAppInstanceRepository } from "../repositories/AdminWhatsAppInstanceRepository";
import { AdminWhatsAppShopRepository } from "../repositories/AdminWhatsAppShopRepository";
import { AdminWhatsAppConversationRepository } from "../repositories/AdminWhatsAppConversationRepository";
import { AdminWhatsAppOwnerBotLogRepository } from "../repositories/AdminWhatsAppOwnerBotLogRepository";
import { AdminWhatsAppQueueGateway } from "../repositories/AdminWhatsAppQueueGateway";
import { GetPlatformWhatsAppSettingsUseCase } from "../useCases/whatsapp/GetPlatformWhatsAppSettingsUseCase";
import { UpdatePlatformWhatsAppSettingsUseCase } from "../useCases/whatsapp/UpdatePlatformWhatsAppSettingsUseCase";
import { GetWhatsAppOverviewUseCase } from "../useCases/whatsapp/GetWhatsAppOverviewUseCase";
import { ListWhatsAppInstancesUseCase } from "../useCases/whatsapp/ListWhatsAppInstancesUseCase";
import { ReconnectWhatsAppInstanceUseCase } from "../useCases/whatsapp/ReconnectWhatsAppInstanceUseCase";
import { LogoutWhatsAppInstanceUseCase } from "../useCases/whatsapp/LogoutWhatsAppInstanceUseCase";
import { ListWhatsAppShopsUseCase } from "../useCases/whatsapp/ListWhatsAppShopsUseCase";
import { BatchSetShopAiEnabledUseCase } from "../useCases/whatsapp/BatchSetShopAiEnabledUseCase";
import { BatchSetShopOwnerBotUseCase } from "../useCases/whatsapp/BatchSetShopOwnerBotUseCase";
import { SetShopAiEnabledUseCase } from "../useCases/whatsapp/SetShopAiEnabledUseCase";
import { SetShopOwnerBotUseCase } from "../useCases/whatsapp/SetShopOwnerBotUseCase";
import { ListAiConversationsUseCase } from "../useCases/whatsapp/ListAiConversationsUseCase";
import { GetAiConversationUseCase } from "../useCases/whatsapp/GetAiConversationUseCase";
import { TransferAiConversationUseCase } from "../useCases/whatsapp/TransferAiConversationUseCase";
import { ListOwnerBotActionLogsUseCase } from "../useCases/whatsapp/ListOwnerBotActionLogsUseCase";
import { ListFailedWhatsAppNotificationsUseCase } from "../useCases/whatsapp/ListFailedWhatsAppNotificationsUseCase";
import { RetryWhatsAppDeliveryUseCase } from "../useCases/whatsapp/RetryWhatsAppDeliveryUseCase";
import { RetryWhatsAppOutboxUseCase } from "../useCases/whatsapp/RetryWhatsAppOutboxUseCase";
import { ListWhatsAppQueuesUseCase } from "../useCases/whatsapp/ListWhatsAppQueuesUseCase";
import { ReprocessWhatsAppJobUseCase } from "../useCases/whatsapp/ReprocessWhatsAppJobUseCase";
import { CleanWhatsAppJobUseCase } from "../useCases/whatsapp/CleanWhatsAppJobUseCase";

interface PaginationQuery {
  page?: unknown;
  limit?: unknown;
  search?: unknown;
  aiEnabled?: unknown;
  barbershopId?: unknown;
  status?: unknown;
  riskClass?: unknown;
}

function parsePagination(query: PaginationQuery) {
  const page = Math.max(1, Number(query?.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query?.limit) || 20));
  return { page, limit };
}

export class AdminWhatsAppController {
  // ─── overview ────────────────────────────────────────────────────────────
  async overview(_request: FastifyRequest, reply: FastifyReply) {
    const useCase = new GetWhatsAppOverviewUseCase(
      new PlatformWhatsAppSettingsRepository(),
      new AdminWhatsAppOverviewRepository(),
      new AdminWhatsAppQueueGateway()
    );
    const data = await useCase.execute();
    return reply.send({ success: true, data });
  }

  async instances(request: FastifyRequest, reply: FastifyReply) {
    const query = whatsappPaginationQuerySchema.parse(request.query ?? {});
    const useCase = new ListWhatsAppInstancesUseCase(new AdminWhatsAppInstanceRepository());
    const result = await useCase.execute({ page: query.page, limit: query.limit });
    return reply.send({ success: true, data: result.data, meta: result.meta });
  }

  async platformSettingsGet(_request: FastifyRequest, reply: FastifyReply) {
    const useCase = new GetPlatformWhatsAppSettingsUseCase(new PlatformWhatsAppSettingsRepository());
    const settings = await useCase.execute();
    return reply.send({ success: true, data: settings });
  }

  async platformSettingsPut(request: FastifyRequest, reply: FastifyReply) {
    const body = whatsappPlatformSettingsPutSchema.parse(request.body);
    const user = request.user as { id: string };
    const useCase = new UpdatePlatformWhatsAppSettingsUseCase(
      new PlatformWhatsAppSettingsRepository(),
      new AdminWhatsAppAuditRepository()
    );
    const updated = await useCase.execute({
      aiGloballyEnabled: body.aiGloballyEnabled,
      ownerBotGloballyEnabled: body.ownerBotGloballyEnabled,
      outboundPaused: body.outboundPaused,
      reason: body.reason,
      updatedBy: user.id,
      ipAddress: request.ip,
    });

    return reply.send({ success: true, data: updated });
  }

  // ─── shops ───────────────────────────────────────────────────────────────
  async shops(request: FastifyRequest, reply: FastifyReply) {
    const query = (request.query ?? {}) as PaginationQuery;
    const { page, limit } = parsePagination(query);
    const useCase = new ListWhatsAppShopsUseCase(new AdminWhatsAppShopRepository());
    const result = await useCase.execute({
      page,
      limit,
      search: query.search ? String(query.search) : undefined,
      aiEnabled:
        query.aiEnabled === "true" ? true : query.aiEnabled === "false" ? false : undefined,
    });

    return reply.send({ success: true, data: result.data, meta: result.meta });
  }

  async batchPatchShopAi(request: FastifyRequest, reply: FastifyReply) {
    const body = whatsappBatchAiSchema.parse(request.body);
    const user = request.user as { id: string };
    const useCase = new BatchSetShopAiEnabledUseCase(new AdminWhatsAppShopRepository());
    const result = await useCase.execute({
      ids: body.ids,
      enabled: body.enabled,
      reason: body.reason,
      userId: user.id,
      ipAddress: request.ip,
    });

    return reply.send({ success: true, data: result });
  }

  async patchShopAi(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = whatsappPatchShopAiSchema.parse(request.body);
    const user = request.user as { id: string };
    const useCase = new SetShopAiEnabledUseCase(new AdminWhatsAppShopRepository());
    const result = await useCase.execute({
      id,
      enabled: body.enabled,
      reason: body.reason,
      userId: user.id,
      ipAddress: request.ip,
    });

    return reply.send({ success: true, data: result });
  }

  async batchPatchShopOwnerBot(request: FastifyRequest, reply: FastifyReply) {
    const body = whatsappBatchOwnerBotSchema.parse(request.body);
    const user = request.user as { id: string };
    const useCase = new BatchSetShopOwnerBotUseCase(new AdminWhatsAppShopRepository());
    const result = await useCase.execute({
      ids: body.ids,
      enabled: body.enabled,
      blocked: body.blocked,
      reason: body.reason,
      userId: user.id,
      ipAddress: request.ip,
    });

    return reply.send({ success: true, data: result });
  }

  async patchShopOwnerBot(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = whatsappPatchShopOwnerBotSchema.parse(request.body);
    const user = request.user as { id: string };
    const useCase = new SetShopOwnerBotUseCase(new AdminWhatsAppShopRepository());
    const result = await useCase.execute({
      id,
      enabled: body.enabled,
      blocked: body.blocked,
      revokeLinks: body.revokeLinks ?? false,
      reason: body.reason,
      userId: user.id,
      ipAddress: request.ip,
    });

    return reply.send({ success: true, data: result });
  }

  async shopInstanceReconnect(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = whatsappInstanceReasonSchema.parse(request.body);
    const user = request.user as { id: string };
    const useCase = new ReconnectWhatsAppInstanceUseCase(
      new AdminWhatsAppInstanceRepository(),
      new AdminWhatsAppAuditRepository()
    );
    const result = await useCase.execute({
      shopId: id,
      reason: body.reason,
      userId: user.id,
      ipAddress: request.ip,
    });

    return reply.send({ success: true, data: result });
  }

  async shopInstanceLogout(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = whatsappInstanceReasonSchema.parse(request.body);
    const user = request.user as { id: string };
    const useCase = new LogoutWhatsAppInstanceUseCase(
      new AdminWhatsAppInstanceRepository(),
      new AdminWhatsAppAuditRepository()
    );
    const result = await useCase.execute({
      shopId: id,
      reason: body.reason,
      userId: user.id,
      ipAddress: request.ip,
    });

    return reply.send({ success: true, data: result });
  }

  // ─── AI conversations cross-tenant ───────────────────────────────────────
  async aiConversations(request: FastifyRequest, reply: FastifyReply) {
    const query = (request.query ?? {}) as PaginationQuery;
    const { page, limit } = parsePagination(query);
    const useCase = new ListAiConversationsUseCase(new AdminWhatsAppConversationRepository());
    const result = await useCase.execute({
      page,
      limit,
      barbershopId: query.barbershopId ? String(query.barbershopId) : undefined,
      status: query.status ? String(query.status) : undefined,
    });

    return reply.send({ success: true, data: result.data, meta: result.meta });
  }

  async aiConversationDetail(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const useCase = new GetAiConversationUseCase(new AdminWhatsAppConversationRepository());
    const data = await useCase.execute(id);
    return reply.send({ success: true, data });
  }

  async aiTransfer(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = whatsappReasonSchema.parse(request.body);
    const user = request.user as { id: string };
    const useCase = new TransferAiConversationUseCase(new AdminWhatsAppConversationRepository());
    const result = await useCase.execute({
      id,
      reason: body.reason,
      userId: user.id,
      ipAddress: request.ip,
    });

    return reply.send({ success: true, data: result });
  }

  // ─── owner bot action logs ───────────────────────────────────────────────
  async ownerBotActionLogs(request: FastifyRequest, reply: FastifyReply) {
    const query = (request.query ?? {}) as PaginationQuery;
    const { page, limit } = parsePagination(query);
    const useCase = new ListOwnerBotActionLogsUseCase(new AdminWhatsAppOwnerBotLogRepository());
    const result = await useCase.execute({
      page,
      limit,
      barbershopId: query.barbershopId ? String(query.barbershopId) : undefined,
      riskClass: query.riskClass ? String(query.riskClass) : undefined,
      status: query.status ? String(query.status) : undefined,
    });

    return reply.send({ success: true, data: result.data, meta: result.meta });
  }

  // ─── notification delivery / outbox retry ───────────────────────────────
  async failedNotifications(_request: FastifyRequest, reply: FastifyReply) {
    const useCase = new ListFailedWhatsAppNotificationsUseCase(
      new AdminWhatsAppNotificationRepository(),
      new PlatformWhatsAppSettingsRepository()
    );
    const data = await useCase.execute();
    return reply.send({ success: true, data });
  }

  async retryDelivery(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = whatsappReasonSchema.parse(request.body);
    const user = request.user as { id: string };
    const useCase = new RetryWhatsAppDeliveryUseCase(
      new AdminWhatsAppNotificationRepository(),
      new PlatformWhatsAppSettingsRepository()
    );
    const result = await useCase.execute({
      id,
      reason: body.reason,
      userId: user.id,
      ipAddress: request.ip,
    });
    return reply.send({ success: true, data: result });
  }

  async retryOutbox(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = whatsappReasonSchema.parse(request.body);
    const user = request.user as { id: string };
    const useCase = new RetryWhatsAppOutboxUseCase(
      new AdminWhatsAppNotificationRepository(),
      new PlatformWhatsAppSettingsRepository()
    );
    const result = await useCase.execute({
      id,
      reason: body.reason,
      userId: user.id,
      ipAddress: request.ip,
    });
    return reply.send({ success: true, data: result });
  }

  // ─── queues ──────────────────────────────────────────────────────────────
  async queues(_request: FastifyRequest, reply: FastifyReply) {
    const useCase = new ListWhatsAppQueuesUseCase(new AdminWhatsAppQueueGateway());
    const data = await useCase.execute();
    return reply.send({ success: true, data });
  }

  async reprocessJob(request: FastifyRequest, reply: FastifyReply) {
    const body = whatsappReasonSchema.parse(request.body);
    const params = (request.params ?? {}) as { queue?: string; jobId?: string };
    const user = request.user as { id: string };
    const useCase = new ReprocessWhatsAppJobUseCase(
      new AdminWhatsAppQueueGateway(),
      new AdminWhatsAppAuditRepository()
    );
    const result = await useCase.execute({
      queue: String(params.queue ?? ""),
      jobId: String(params.jobId ?? ""),
      reason: body.reason,
      userId: user.id,
      ipAddress: request.ip,
    });

    return reply.send({ success: true, data: result });
  }

  async cleanJob(request: FastifyRequest, reply: FastifyReply) {
    const body = whatsappReasonSchema.parse(request.body);
    const params = (request.params ?? {}) as { queue?: string; jobId?: string };
    const user = request.user as { id: string };
    const useCase = new CleanWhatsAppJobUseCase(
      new AdminWhatsAppQueueGateway(),
      new AdminWhatsAppAuditRepository()
    );
    const result = await useCase.execute({
      queue: String(params.queue ?? ""),
      jobId: String(params.jobId ?? ""),
      reason: body.reason,
      userId: user.id,
      ipAddress: request.ip,
    });

    return reply.send({ success: true, data: result });
  }
}
