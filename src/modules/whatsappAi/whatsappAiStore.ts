import type IORedis from "ioredis";
import { getApiRedisConnection } from "@/shared/infra/queue/redisConnection";
import { getModuleLogger } from "@/shared/utils/logger";
import type { AiResolvedSalon } from "./whatsappAi.types";

/**
 * Estado efêmero do atendente de IA.
 *
 * Fica no Redis (com queda para memória quando o Redis cai), porque é
 * descartável: dedupe de mensagens, limite de respostas por minuto e a
 * escolha de salão pendente quando o cliente é cliente de mais de uma unidade.
 */

const logger = getModuleLogger("whatsapp-ai:store");

const SELECTION_TTL_SECONDS = 15 * 60;
const MESSAGE_DEDUPE_TTL_SECONDS = 24 * 60 * 60;
const RATE_LIMIT_SECONDS = 60;
const RATE_LIMIT_MAX = 10;

const SELECTION_PREFIX = "whatsappai:selection:";
const MESSAGE_PREFIX = "whatsappai:msg:";
const RATE_LIMIT_PREFIX = "whatsappai:rate:";

export type AiPendingSelection = {
  options: AiResolvedSalon[];
  createdAt: number;
};

export interface WhatsAppAiStore {
  /** true = mensagem já processada (idempotência). */
  markMessageSeen(messageId: string): Promise<boolean>;
  /** true = ainda pode responder agora (teto por minuto). */
  allowReply(phone: string): Promise<boolean>;
  getSelection(phone: string): Promise<AiPendingSelection | null>;
  setSelection(phone: string, selection: AiPendingSelection): Promise<void>;
  clearSelection(phone: string): Promise<void>;
}

/** Store em memória — usado em teste e como fallback quando o Redis cai. */
export class InMemoryWhatsAppAiStore implements WhatsAppAiStore {
  private messages = new Set<string>();
  private rate = new Map<string, number[]>();
  private selections = new Map<string, AiPendingSelection>();

  async markMessageSeen(messageId: string): Promise<boolean> {
    if (this.messages.has(messageId)) return true;
    this.messages.add(messageId);
    return false;
  }

  async allowReply(phone: string): Promise<boolean> {
    const now = Date.now();
    const recent = (this.rate.get(phone) ?? []).filter(
      (timestamp) => now - timestamp < RATE_LIMIT_SECONDS * 1000
    );
    if (recent.length >= RATE_LIMIT_MAX) {
      this.rate.set(phone, recent);
      return false;
    }
    recent.push(now);
    this.rate.set(phone, recent);
    return true;
  }

  async getSelection(phone: string): Promise<AiPendingSelection | null> {
    return this.selections.get(phone) ?? null;
  }

  async setSelection(phone: string, selection: AiPendingSelection): Promise<void> {
    this.selections.set(phone, selection);
  }

  async clearSelection(phone: string): Promise<void> {
    this.selections.delete(phone);
  }
}

export class RedisWhatsAppAiStore implements WhatsAppAiStore {
  private fallback = new InMemoryWhatsAppAiStore();

  constructor(private redis?: IORedis) {}

  private client(): IORedis {
    if (!this.redis) this.redis = getApiRedisConnection();
    return this.redis;
  }

  async markMessageSeen(messageId: string): Promise<boolean> {
    try {
      const result = await this.client().set(
        `${MESSAGE_PREFIX}${messageId}`,
        "1",
        "EX",
        MESSAGE_DEDUPE_TTL_SECONDS,
        "NX"
      );
      return result === null;
    } catch (err) {
      logger.warn({ err }, "Redis indisponível no dedupe — usando memória");
      return this.fallback.markMessageSeen(messageId);
    }
  }

  async allowReply(phone: string): Promise<boolean> {
    try {
      const key = `${RATE_LIMIT_PREFIX}${phone}`;
      const count = await this.client().incr(key);
      if (count === 1) await this.client().expire(key, RATE_LIMIT_SECONDS);
      return count <= RATE_LIMIT_MAX;
    } catch (err) {
      logger.warn({ err }, "Redis indisponível no limite de respostas — usando memória");
      return this.fallback.allowReply(phone);
    }
  }

  async getSelection(phone: string): Promise<AiPendingSelection | null> {
    try {
      const raw = await this.client().get(`${SELECTION_PREFIX}${phone}`);
      if (!raw) return null;
      return JSON.parse(raw) as AiPendingSelection;
    } catch (err) {
      logger.warn({ err }, "Redis indisponível ao ler a seleção — usando memória");
      return this.fallback.getSelection(phone);
    }
  }

  async setSelection(phone: string, selection: AiPendingSelection): Promise<void> {
    try {
      await this.client().set(
        `${SELECTION_PREFIX}${phone}`,
        JSON.stringify(selection),
        "EX",
        SELECTION_TTL_SECONDS
      );
    } catch (err) {
      logger.warn({ err }, "Redis indisponível ao gravar a seleção — usando memória");
      await this.fallback.setSelection(phone, selection);
    }
  }

  async clearSelection(phone: string): Promise<void> {
    try {
      await this.client().del(`${SELECTION_PREFIX}${phone}`);
    } catch (err) {
      logger.warn({ err }, "Redis indisponível ao limpar a seleção — usando memória");
    }
    await this.fallback.clearSelection(phone);
  }
}

/** Store padrão (Redis com fallback em memória). */
export function createWhatsAppAiStore(): WhatsAppAiStore {
  return new RedisWhatsAppAiStore();
}
