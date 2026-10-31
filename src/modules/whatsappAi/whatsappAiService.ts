import { AppError } from "@/shared/errors/AppError";
import { getModuleLogger } from "@/shared/utils/logger";
import { detectAiIntent, shouldEscalate, type AiIntent } from "./whatsappAiIntent";
import { buildAiResponse } from "./whatsappAiResponses";
import { canonicalAiPhone, maskAiPhone } from "./whatsappAiPhone";
import { WhatsAppAiRepository } from "./whatsappAiRepository";
import { createWhatsAppAiStore, type WhatsAppAiStore } from "./whatsappAiStore";
import {
  EvolutionWhatsAppAiMessenger,
  type WhatsAppAiMessenger,
} from "./whatsappAiMessenger";
import { hasWhatsAppAiAccess } from "./whatsappAiSubscription";
import { resolveAiInstanceRoute } from "./whatsappAiWebhook";
import type {
  AiHandleOutcome,
  AiInboundMessage,
  AiResolvedSalon,
  AiSalonContext,
} from "./whatsappAi.types";

/**
 * Atendente de IA do salão.
 *
 * Regras:
 * - o salão atendido é resolvido pelo número do cliente (portal do cliente ou
 *   CRM do salão); com mais de uma unidade, o cliente escolhe;
 * - a resposta sai pela mesma instância em que o cliente escreveu;
 * - a mensagem é respondida com dados REAIS do salão (endereço, horários,
 *   preços cadastrados);
 * - sem certeza (intenção desconhecida) ou a pedido do cliente, a conversa
 *   vai para um humano.
 */

const logger = getModuleLogger("whatsapp-ai:service");

export type WhatsAppAiServiceDeps = {
  repo?: WhatsAppAiRepository;
  store?: WhatsAppAiStore;
  messenger?: WhatsAppAiMessenger;
  hasAccess?: (barbershopId: string) => Promise<boolean>;
  now?: () => Date;
};

export type AiProcessedMessage = {
  conversationId: string;
  message: unknown;
  intent: AiIntent;
  confidence: number;
  transferredToHuman: boolean;
  handledBy: "AI" | "HUMAN" | "HYBRID";
  reply: string;
};

/** "1", "2"… — escolha de salão pelo cliente. */
function parseSelectionIndex(text: string): number | null {
  const normalized = (text ?? "").trim();
  if (!/^\d{1,2}$/.test(normalized)) return null;
  const index = Number(normalized);
  return index >= 1 && index <= 20 ? index : null;
}

function buildShopClarification(options: AiResolvedSalon[]): string {
  const list = options
    .map((option, index) => `${index + 1}. ${option.name}`)
    .join("\n");
  return `Você é cliente de ${options.length} unidades. Qual delas?\n\n${list}\n\nResponda com o número da unidade.`;
}

export class WhatsAppAiService {
  private repo: WhatsAppAiRepository;
  private store: WhatsAppAiStore;
  private messenger: WhatsAppAiMessenger;
  private hasAccess: (barbershopId: string) => Promise<boolean>;
  private now: () => Date;

  constructor(deps: WhatsAppAiServiceDeps = {}) {
    this.repo = deps.repo ?? new WhatsAppAiRepository();
    this.store = deps.store ?? createWhatsAppAiStore();
    this.messenger = deps.messenger ?? new EvolutionWhatsAppAiMessenger();
    this.hasAccess = deps.hasAccess ?? hasWhatsAppAiAccess;
    this.now = deps.now ?? (() => new Date());
  }

  // ─── Entrada em tempo real (Evolution) ─────────────────────────────────────

  async handleIncoming(message: AiInboundMessage): Promise<AiHandleOutcome> {
    const phone = canonicalAiPhone(message.phone);
    const text = (message.text ?? "").trim();
    if (!phone || !text) return { status: "ignored", reason: "mensagem vazia" };
    // Número curto demais não identifica cliente (e é o formato de grupo).
    if (phone.length < 10) return { status: "ignored", reason: "número inválido" };

    // Idempotência: a Evolution reenvia a mesma mensagem (key.id) em retries.
    if (await this.store.markMessageSeen(message.messageId)) {
      return { status: "ignored", reason: "mensagem já processada" };
    }

    const route = resolveAiInstanceRoute(message.instanceName);
    if (route.kind === "ignored") {
      return { status: "ignored", reason: route.reason };
    }

    if (!(await this.store.allowReply(phone))) {
      return { status: "ignored", reason: "limite de respostas por minuto" };
    }

    const replyInstance = message.instanceName;

    if (route.kind === "shop") {
      return this.answerForSalon(route.barbershopId, phone, text, replyInstance);
    }

    // Linha compartilhada da IA: o salão vem do número do cliente.
    const pending = await this.store.getSelection(phone);
    const selectedIndex = parseSelectionIndex(text);

    if (pending && selectedIndex !== null) {
      const chosen = pending.options[selectedIndex - 1];
      if (!chosen) {
        await this.messenger.send(phone, buildShopClarification(pending.options), replyInstance);
        return { status: "clarify_shop", options: pending.options };
      }

      await this.store.clearSelection(phone);
      const result = await this.answerForSalon(chosen.id, phone, text, replyInstance, {
        selectionMessage: `Perfeito! Você está falando com o ${chosen.name}. Como posso te ajudar?`,
      });
      return result;
    }

    const salons = await this.repo.resolveSalonsByPhone(phone);
    if (salons.length === 0) {
      logger.info({ phone: maskAiPhone(phone) }, "Cliente sem salão vinculado — mensagem ignorada");
      return { status: "ignored", reason: "cliente sem salão vinculado" };
    }

    if (salons.length > 1) {
      await this.store.setSelection(phone, { options: salons, createdAt: this.now().getTime() });
      await this.messenger.send(phone, buildShopClarification(salons), replyInstance);
      return { status: "clarify_shop", options: salons };
    }

    return this.answerForSalon(salons[0].id, phone, text, replyInstance);
  }

  /** Responde como um salão específico (após resolver o cliente). */
  private async answerForSalon(
    barbershopId: string,
    phone: string,
    text: string,
    replyInstance: string | undefined,
    options?: { selectionMessage?: string }
  ): Promise<AiHandleOutcome> {
    const settings = await this.repo.getAiSettings(barbershopId);
    if (!settings || !settings.active) {
      return { status: "ignored", reason: "salão inexistente ou inativo" };
    }
    if (!settings.whatsappAiEnabled) {
      return { status: "ignored", reason: "atendente de IA desativado no salão" };
    }
    if (!(await this.hasAccess(barbershopId))) {
      return { status: "ignored", reason: "salão sem acesso ao atendente de IA" };
    }

    const context = await this.repo.getSalonContext(barbershopId);
    if (!context) return { status: "ignored", reason: "salão sem contexto" };

    if (options?.selectionMessage) {
      const conversation = await this.repo.findOrCreateConversation(barbershopId, phone);
      await this.repo.createMessage({
        conversationId: conversation.id,
        direction: "INBOUND",
        content: text,
      });
      await this.repo.updateConversationLastMessage(conversation.id);
      await this.repo.createMessage({
        conversationId: conversation.id,
        direction: "OUTBOUND",
        content: options.selectionMessage,
        intent: "greeting",
        entities: {},
        confidence: 1,
      });
      await this.messenger.send(phone, options.selectionMessage, replyInstance);
      return {
        status: "shop_selected",
        conversationId: conversation.id,
        salonId: barbershopId,
        reply: options.selectionMessage,
      };
    }

    const processed = await this.processMessage(barbershopId, phone, text, context);
    await this.messenger.send(phone, processed.reply, replyInstance);

    return {
      status: "answered",
      conversationId: processed.conversationId,
      intent: processed.intent,
      confidence: processed.confidence,
      reply: processed.reply,
    };
  }

  // ─── Processamento da mensagem ─────────────────────────────────────────────

  /**
   * Persiste a mensagem, detecta a intenção e monta a resposta.
   * Usado tanto pelo webhook (que envia) quanto pelo painel/API (que devolve).
   */
  async processMessage(
    barbershopId: string,
    phone: string,
    content: string,
    context: AiSalonContext
  ): Promise<AiProcessedMessage> {
    const conversation = await this.repo.findOrCreateConversation(barbershopId, phone);

    await this.repo.createMessage({
      conversationId: conversation.id,
      direction: "INBOUND",
      content,
    });

    await this.repo.updateConversationLastMessage(conversation.id);

    const { intent, confidence, entities } = detectAiIntent(content);
    const escalate = shouldEscalate({ intent, confidence, entities });
    const reply = buildAiResponse({ intent, salon: context, message: content });

    const aiMessage = await this.repo.createMessage({
      conversationId: conversation.id,
      direction: "OUTBOUND",
      content: reply,
      intent,
      entities,
      confidence,
    });

    const needsHuman = escalate || intent === "scheduling" || intent === "reschedule";
    const handledBy: "AI" | "HUMAN" | "HYBRID" = needsHuman ? "HYBRID" : "AI";
    const resolution = escalate
      ? "Transferência solicitada"
      : needsHuman
        ? "Resposta automática — aguardando atendente"
        : "Resposta automática";

    await this.repo.createIntentLog({
      barbershopId,
      phone,
      intent,
      entities,
      confidence,
      handledBy,
      resolution,
    });

    if (escalate) {
      await this.repo.transferToHuman(conversation.id);
    }

    return {
      conversationId: conversation.id,
      message: aiMessage,
      intent,
      confidence,
      transferredToHuman: escalate,
      handledBy,
      reply,
    };
  }

  // ─── Painel / API ──────────────────────────────────────────────────────────

  /** Processa uma mensagem vinda do painel/API (sem envio ao WhatsApp). */
  async processIncomingMessage(barbershopId: string, phone: string, content: string) {
    const context = await this.repo.getSalonContext(barbershopId);
    if (!context) throw new AppError("Estabelecimento não encontrado", 404);

    const processed = await this.processMessage(barbershopId, phone, content, context);

    return {
      conversationId: processed.conversationId,
      message: processed.message,
      intent: processed.intent,
      confidence: processed.confidence,
      transferredToHuman: processed.transferredToHuman,
      handledBy: processed.handledBy,
      reply: processed.reply,
    };
  }

  // ─── Consultas ─────────────────────────────────────────────────────────────

  async listConversations(barbershopId: string, filters?: { status?: string; page?: number; limit?: number }) {
    return this.repo.listByBarbershop(barbershopId, filters);
  }

  async getConversationDetail(id: string, barbershopId: string) {
    const conversation = await this.repo.findById(id);
    if (!conversation) throw new AppError("Conversa não encontrada", 404);
    if (conversation.barbershopId !== barbershopId) throw new AppError("Acesso negado", 403);

    const messages = await this.repo.getMessages(id);
    return { ...conversation, messages };
  }

  async getIntentLogs(
    barbershopId: string,
    filters?: { intent?: string; startDate?: string; endDate?: string; page?: number; limit?: number }
  ) {
    return this.repo.getIntentLogs(barbershopId, filters);
  }

  async getIntentStats(barbershopId: string) {
    return this.repo.getIntentStats(barbershopId);
  }

  async transferToHuman(id: string, barbershopId: string) {
    const conversation = await this.repo.findById(id);
    if (!conversation) throw new AppError("Conversa não encontrada", 404);
    if (conversation.barbershopId !== barbershopId) throw new AppError("Acesso negado", 403);
    if (conversation.status !== "ACTIVE") throw new AppError("Conversa já finalizada", 400);

    return this.repo.transferToHuman(id);
  }
}
