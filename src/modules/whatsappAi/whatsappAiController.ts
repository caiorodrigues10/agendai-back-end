import { FastifyRequest, FastifyReply } from "fastify";
import {
  processIncomingMessageSchema,
  listConversationsSchema,
  intentLogsSchema,
  updateAiSettingsSchema,
} from "./whatsappAiSchema";
import { WhatsAppAiService } from "./whatsappAiService";
import { WhatsAppAiRepository } from "./whatsappAiRepository";
import { AppError } from "@/shared/errors/AppError";
import { getModuleLogger } from "@/shared/utils/logger";
import { parseEvolutionWebhook, verifyWebhookSecret } from "@/shared/services/evolutionWebhook";
import { enqueueWhatsAppAiMessage } from "@/shared/infra/queue/whatsappAiQueue";
import { getPlatformWhatsAppSettings } from "@/shared/services/platformWhatsAppSettings";

const logger = getModuleLogger("whatsapp-ai:controller");

export type WhatsAppAiControllerDeps = {
  service?: WhatsAppAiService;
  repo?: WhatsAppAiRepository;
};

export class WhatsAppAiController {
  private service: WhatsAppAiService;
  private repo: WhatsAppAiRepository;

  constructor(deps: WhatsAppAiControllerDeps = {}) {
    this.service = deps.service ?? new WhatsAppAiService();
    this.repo = deps.repo ?? new WhatsAppAiRepository();
  }

  /** Processa uma mensagem (painel/API) e devolve a resposta da IA. */
  async processIncoming(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { barbershopId } = request.params as { barbershopId: string };
    const resolvedBarbershopId = this.resolveBarbershopId(request.user!, barbershopId);
    const body = processIncomingMessageSchema.parse(request.body);

    const result = await this.service.processIncomingMessage(
      resolvedBarbershopId,
      body.phone,
      body.content
    );
    reply.send({ success: true, data: result });
  }

  async listConversations(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { barbershopId } = request.params as { barbershopId: string };
    const resolvedBarbershopId = this.resolveBarbershopId(request.user!, barbershopId);
    const query = listConversationsSchema.parse(request.query ?? {});

    const result = await this.service.listConversations(resolvedBarbershopId, query);
    reply.send({ success: true, data: result });
  }

  async getConversationDetail(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { barbershopId, id } = request.params as { barbershopId: string; id: string };
    const resolvedBarbershopId = this.resolveBarbershopId(request.user!, barbershopId);

    const result = await this.service.getConversationDetail(id, resolvedBarbershopId);
    reply.send({ success: true, data: result });
  }

  async getIntentLogs(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { barbershopId } = request.params as { barbershopId: string };
    const resolvedBarbershopId = this.resolveBarbershopId(request.user!, barbershopId);
    const query = intentLogsSchema.parse(request.query ?? {});

    const result = await this.service.getIntentLogs(resolvedBarbershopId, query);
    reply.send({ success: true, data: result });
  }

  async getStats(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { barbershopId } = request.params as { barbershopId: string };
    const resolvedBarbershopId = this.resolveBarbershopId(request.user!, barbershopId);

    const result = await this.service.getIntentStats(resolvedBarbershopId);
    reply.send({ success: true, data: result });
  }

  async transferToHuman(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { barbershopId, id } = request.params as { barbershopId: string; id: string };
    const resolvedBarbershopId = this.resolveBarbershopId(request.user!, barbershopId);

    const result = await this.service.transferToHuman(id, resolvedBarbershopId);
    reply.send({ success: true, data: result });
  }

  /** Configuração do atendente de IA no salão (ligado/desligado). */
  async getSettings(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { barbershopId } = request.params as { barbershopId: string };
    const resolvedBarbershopId = this.resolveBarbershopId(request.user!, barbershopId);

    const settings = await this.repo.getAiSettings(resolvedBarbershopId);
    if (!settings) throw new AppError("Estabelecimento não encontrado", 404);

    reply.send({
      success: true,
      data: {
        barbershopId: settings.id,
        name: settings.name,
        enabled: settings.whatsappAiEnabled,
        aiInstanceConfigured: Boolean(process.env.EVOLUTION_AI_INSTANCE_NAME?.trim()),
      },
    });
  }

  async updateSettings(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { barbershopId } = request.params as { barbershopId: string };
    const resolvedBarbershopId = this.resolveBarbershopId(request.user!, barbershopId);
    const body = updateAiSettingsSchema.parse(request.body);

    const shop = await this.repo.getAiSettings(resolvedBarbershopId);
    if (!shop) throw new AppError("Estabelecimento não encontrado", 404);

    const updated = await this.repo.setAiEnabled(resolvedBarbershopId, body.enabled);
    reply.send({
      success: true,
      data: {
        barbershopId: updated.id,
        name: updated.name,
        enabled: updated.whatsappAiEnabled,
        aiInstanceConfigured: Boolean(process.env.EVOLUTION_AI_INSTANCE_NAME?.trim()),
      },
    });
  }

  /**
   * Webhook de entrada da Evolution (atendente de IA).
   * Autenticado por segredo e enfileirado para processamento assíncrono.
   */
  async handleEvolutionWebhook(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const expected = process.env.EVOLUTION_WEBHOOK_SECRET?.trim();
    const provided =
      (request.headers["x-webhook-secret"] as string | undefined) ??
      (request.headers["x-evolution-webhook-secret"] as string | undefined) ??
      bearerToken(request.headers.authorization);

    if (!expected) {
      logger.error("EVOLUTION_WEBHOOK_SECRET não configurado — webhook de IA recusado");
      throw new AppError("Webhook não configurado", 503);
    }
    if (!verifyWebhookSecret(provided, expected)) {
      throw new AppError("Webhook inválido", 401);
    }

    const platformSettings = await getPlatformWhatsAppSettings();
    if (!platformSettings.aiGloballyEnabled) {
      reply.send({ success: true, data: { ignored: "atendente de IA desligado globalmente" } });
      return;
    }

    const event = parseEvolutionWebhook(request.body);
    if (event.type === "IGNORED") {
      reply.send({ success: true, data: { ignored: event.reason } });
      return;
    }
    // Mídia sem texto: atendente de IA não processa (sem custo de IA).
    if (!event.text || !event.text.trim()) {
      reply.send({ success: true, data: { ignored: "mensagem sem texto" } });
      return;
    }

    try {
      await enqueueWhatsAppAiMessage({
        messageId: event.messageId,
        phone: event.phone,
        text: event.text,
        instanceName: event.instanceName,
      });
      reply.send({ success: true, data: { queued: true } });
    } catch (err) {
      // Redis/fila fora: processa na hora para não perder a mensagem.
      logger.error({ err }, "Fila do atendente de IA indisponível — processando inline");
      const outcome = await this.service.handleIncoming({
        messageId: event.messageId,
        phone: event.phone,
        text: event.text,
        instanceName: event.instanceName,
      });
      reply.send({ success: true, data: { queued: false, outcome: outcome.status } });
    }
  }

  /**
   * O dono só enxerga o próprio salão. Sem essa checagem, um OWNER passava o
   * id de outro salão na URL e lia as conversas dele.
   */
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
