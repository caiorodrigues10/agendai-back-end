import { FastifyRequest, FastifyReply } from "fastify";
import { AppError } from "@/shared/errors/AppError";
import { getModuleLogger } from "@/shared/utils/logger";
import { normalizeWhatsAppPhone } from "@/shared/services/evolutionApiService";
import { OwnerBotRepository } from "./ownerBotRepository";
import { OwnerBotService } from "./ownerBotService";
import {
  generateOwnerBotLinkCode,
  hashOwnerBotLinkCode,
  OWNER_BOT_LINK_CODE_TTL_MINUTES,
} from "./linkCode";
import { getOwnerBotSegmentProfile } from "./segmentProfiles";
import { maskPhone } from "./messages";
import {
  isPlatformInstance,
  parseEvolutionWebhook,
  verifyWebhookSecret,
} from "./ownerBotWebhook";
import { enqueueOwnerBotMessage } from "@/shared/infra/queue/ownerBotQueue";
import {
  getOwnerBotPreferences,
  updateOwnerBotPreferences,
  type OwnerBotPreferences,
} from "./ownerBotPreferences";
import {
  buildOwnerBotSegmentCatalog,
  type OwnerBotCommandCatalog,
} from "./commands/catalog";
import { OWNER_BOT_COMMANDS } from "./commands/registry";
import {
  barbershopParamsSchema,
  ownerBotActionLogsQuerySchema,
  ownerBotPreferencesUpdateSchema,
} from "./ownerBotSchemas";
import type { OwnerBotActionStatus } from "@prisma/client";

const logger = getModuleLogger("owner-bot:controller");

export class OwnerBotController {
  private repo = new OwnerBotRepository();
  private service = new OwnerBotService();

  /** Gera um código de vínculo de 6 caracteres (10 minutos, uso único). */
  async createLinkCode(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId } = request.params as { barbershopId: string };
    const resolvedBarbershopId = this.resolveBarbershopId(user, barbershopId);

    if (user.role !== "MASTER_ADMIN" && user.role !== "OWNER") {
      throw new AppError("Apenas o dono pode gerar o código de vínculo", 403);
    }

    const shop = await this.repo.findShop(resolvedBarbershopId);
    if (!shop) throw new AppError("Estabelecimento não encontrado", 404);

    const code = generateOwnerBotLinkCode();
    const expiresAt = new Date(Date.now() + OWNER_BOT_LINK_CODE_TTL_MINUTES * 60_000);

    await this.repo.invalidatePendingLinkCodes(user.id);
    await this.repo.createLinkCode({
      userId: user.id,
      barbershopId: resolvedBarbershopId,
      codeHash: hashOwnerBotLinkCode(code),
      expiresAt,
      ipAddress: request.ip ?? null,
    });

    reply.send({
      success: true,
      data: {
        code,
        expiresAt: expiresAt.toISOString(),
        expiresInSeconds: OWNER_BOT_LINK_CODE_TTL_MINUTES * 60,
      },
    });
  }

  /** Estado do vínculo + o que o assistente sabe fazer neste segmento. */
  async getStatus(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId } = request.params as { barbershopId: string };
    const resolvedBarbershopId = this.resolveBarbershopId(user, barbershopId);

    const shop = await this.repo.findShop(resolvedBarbershopId);
    if (!shop) throw new AppError("Estabelecimento não encontrado", 404);

    const links = await this.repo.findActiveLinksByUser(user.id);
    const link = links.find((item) => item.barbershopId === resolvedBarbershopId) ?? null;

    const profile = getOwnerBotSegmentProfile(shop.businessSegment);
    const logs = await this.repo.listActionLogs(resolvedBarbershopId, { limit: 20 });
    const botPhone = process.env.OWNER_BOT_PHONE?.trim() || null;

    reply.send({
      success: true,
      data: {
        linked: Boolean(link),
        phoneMasked: link ? maskPhone(link.normalizedPhone) : null,
        linkedAt: link ? link.linkedAt.toISOString() : null,
        botPhone,
        shopPhoneMasked: shop.whatsapp ? maskPhone(shop.whatsapp) : null,
        highlights: profile.highlights,
        recentActions: logs.map((log) => ({
          id: log.id,
          action: log.action,
          status: log.status,
          createdAt: log.createdAt.toISOString(),
        })),
      },
    });
  }

  /** Preferências do assistente (briefing, resumo, alertas, tom, bloqueio). */
  async getPreferences(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { barbershopId } = this.resolveParams(request);
    await this.requireShop(barbershopId);

    const prefs = await getOwnerBotPreferences(this.repo, barbershopId);
    reply.send({ success: true, data: this.toPreferencesDto(prefs) });
  }

  /** Atualiza preferências (upsert parcial). Bloqueio/desbloqueio via `blocked`. */
  async updatePreferences(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { barbershopId } = this.resolveParams(request);
    await this.requireShop(barbershopId);

    const patch = ownerBotPreferencesUpdateSchema.parse(request.body ?? {});
    const prefs = await updateOwnerBotPreferences(this.repo, barbershopId, patch);
    reply.send({ success: true, data: this.toPreferencesDto(prefs) });
  }

  /** Catálogo de comandos do segmento (o que o assistente sabe fazer aqui). */
  async getCatalog(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { barbershopId } = this.resolveParams(request);
    const shop = await this.requireShop(barbershopId);

    const catalog: OwnerBotCommandCatalog = buildOwnerBotSegmentCatalog(
      OWNER_BOT_COMMANDS,
      shop.businessSegment
    );
    reply.send({ success: true, data: catalog });
  }

  /** Auditoria paginada/filtrável das ações do assistente. */
  async listActionLogs(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { barbershopId } = this.resolveParams(request);
    await this.requireShop(barbershopId);

    const query = ownerBotActionLogsQuerySchema.parse(request.query ?? {});
    const logs = await this.repo.listActionLogs(barbershopId, {
      limit: query.limit ?? 50,
      from: query.from,
      to: query.to,
      commandId: query.commandId,
      riskClass: query.riskClass,
      status: query.status as OwnerBotActionStatus | undefined,
    });

    reply.send({
      success: true,
      data: logs.map((log) => ({
        id: log.id,
        action: log.action,
        commandId: log.commandId,
        riskClass: log.riskClass,
        status: log.status,
        phoneMasked: log.phoneMasked,
        canUndo: log.canUndo,
        undoneAt: log.undoneAt ? log.undoneAt.toISOString() : null,
        errorMessage: log.errorMessage,
        createdAt: log.createdAt.toISOString(),
      })),
    });
  }

  /** Desvincula o número do dono do estabelecimento. */
  async unlink(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId } = request.params as { barbershopId: string };
    const resolvedBarbershopId = this.resolveBarbershopId(user, barbershopId);

    const links = await this.repo.findActiveLinksByUser(user.id);
    const link = links.find((item) => item.barbershopId === resolvedBarbershopId);
    if (link) await this.repo.revokeLink(link.id);

    reply.send({ success: true, data: { linked: false } });
  }

  /**
   * Webhook de entrada da Evolution (instância da plataforma).
   * Autenticado por segredo e enfileirado para processamento assíncrono.
   */
  async handleEvolutionWebhook(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const expected = process.env.EVOLUTION_WEBHOOK_SECRET?.trim();
    const provided =
      (request.headers["x-webhook-secret"] as string | undefined) ??
      (request.headers["x-evolution-webhook-secret"] as string | undefined) ??
      bearerToken(request.headers.authorization);

    if (!expected) {
      logger.error("EVOLUTION_WEBHOOK_SECRET não configurado — webhook recusado");
      throw new AppError("Webhook não configurado", 503);
    }
    if (!verifyWebhookSecret(provided, expected)) {
      throw new AppError("Webhook inválido", 401);
    }

    const event = parseEvolutionWebhook(request.body);
    if (event.type === "IGNORED") {
      reply.send({ success: true, data: { ignored: event.reason } });
      return;
    }

    if (!isPlatformInstance(event.instanceName)) {
      logger.warn(
        { instanceName: event.instanceName },
        "Mensagem recebida em outra instância — ignorada"
      );
      reply.send({ success: true, data: { ignored: "instância não é a da plataforma" } });
      return;
    }

    try {
      await enqueueOwnerBotMessage({
        messageId: event.messageId,
        phone: event.phone,
        text: event.text,
        instanceName: event.instanceName,
      });
      reply.send({ success: true, data: { queued: true } });
    } catch (err) {
      // Redis/fila fora: processa na hora para não perder a mensagem.
      logger.error({ err }, "Fila do assistente indisponível — processando inline");
      await this.service.handleIncoming({
        messageId: event.messageId,
        phone: event.phone,
        text: event.text,
        instanceName: event.instanceName,
      });
      reply.send({ success: true, data: { queued: false } });
    }
  }

  private resolveParams(request: FastifyRequest): { barbershopId: string } {
    const params = barbershopParamsSchema.parse(request.params ?? {});
    const user = request.user!;
    return {
      barbershopId: this.resolveBarbershopId(user, params.barbershopId),
    };
  }

  private async requireShop(barbershopId: string) {
    const shop = await this.repo.findShop(barbershopId);
    if (!shop) throw new AppError("Estabelecimento não encontrado", 404);
    return shop;
  }

  private toPreferencesDto(prefs: OwnerBotPreferences) {
    return {
      enabled: prefs.enabled,
      blocked: prefs.blocked,
      briefingEnabled: prefs.briefingEnabled,
      briefingTime: prefs.briefingTime,
      summaryEnabled: prefs.summaryEnabled,
      summaryTime: prefs.summaryTime,
      alertsEnabled: prefs.alertsEnabled,
      alertTypes: prefs.alertTypes,
      tone: prefs.tone,
      language: prefs.language,
    };
  }

  private resolveBarbershopId(
    user: { role: string; barbershopId?: string | null },
    barbershopId: string
  ): string {
    if (user.role === "MASTER_ADMIN") return barbershopId;
    if (!user.barbershopId) throw new AppError("Usuário não vinculado a nenhum salão", 400);
    if (user.barbershopId !== barbershopId) {
      throw new AppError("Acesso negado: você não pertence a este salão", 403);
    }
    return user.barbershopId;
  }
}

function bearerToken(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : undefined;
}

/** Telefone do dono em formato internacional (usado pelo front no link wa.me). */
export function ownerBotPhoneForLink(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const normalized = normalizeWhatsAppPhone(phone);
  return normalized || null;
}
