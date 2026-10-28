import type IORedis from "ioredis";
import { getApiRedisConnection } from "@/shared/infra/queue/redisConnection";
import { getModuleLogger } from "@/shared/utils/logger";
import type { OwnerBotConversationState } from "./types";

/**
 * Estado da conversa do assistente (Redis).
 *
 * Guardar no Redis (e não no banco) porque o estado é efêmero: some sozinho
 * depois de 15 minutos de inatividade. Se o Redis cair, o bot cai para um
 * mapa em memória — perde o contexto da conversa, mas nunca trava.
 */

const logger = getModuleLogger("owner-bot:store");

const STATE_TTL_SECONDS = 15 * 60;
const MESSAGE_DEDUPE_TTL_SECONDS = 24 * 60 * 60;
const UNLINKED_RATE_LIMIT_SECONDS = 10 * 60;
const WRITE_RATE_LIMIT_SECONDS = 60;
const WRITE_RATE_LIMIT_MAX = 10;
const CAMPAIGN_RATE_LIMIT_SECONDS = 24 * 60 * 60;

export interface OwnerBotStore {
  getState(phone: string): Promise<OwnerBotConversationState | null>;
  setState(phone: string, state: OwnerBotConversationState): Promise<void>;
  clearState(phone: string): Promise<void>;
  /** true = mensagem já processada (idempotência). */
  markMessageSeen(messageId: string): Promise<boolean>;
  /** true = pode responder agora (anti-spam para número não vinculado). */
  allowUnlinkedReply(phone: string): Promise<boolean>;
  /** true = ainda pode executar uma ação de escrita (teto por minuto). */
  allowWriteAction(phone: string): Promise<boolean>;
  /** true = ainda pode disparar um lote/mass message hoje. */
  allowCampaign(barbershopId: string): Promise<boolean>;
}

const STATE_PREFIX = "ownerbot:state:";
const MESSAGE_PREFIX = "ownerbot:msg:";
const SPAM_PREFIX = "ownerbot:spam:";
const WRITE_PREFIX = "ownerbot:write:";
const CAMPAIGN_PREFIX = "ownerbot:campaign:";

/** Store em memória — usado em teste e como fallback quando o Redis cai. */
export class InMemoryOwnerBotStore implements OwnerBotStore {
  private states = new Map<string, OwnerBotConversationState>();
  private messages = new Set<string>();
  private spam = new Set<string>();
  private writes = new Map<string, number[]>();
  private campaigns = new Set<string>();

  async getState(phone: string): Promise<OwnerBotConversationState | null> {
    return this.states.get(phone) ?? null;
  }

  async setState(phone: string, state: OwnerBotConversationState): Promise<void> {
    this.states.set(phone, state);
  }

  async clearState(phone: string): Promise<void> {
    this.states.delete(phone);
  }

  async markMessageSeen(messageId: string): Promise<boolean> {
    if (this.messages.has(messageId)) return true;
    this.messages.add(messageId);
    return false;
  }

  async allowUnlinkedReply(phone: string): Promise<boolean> {
    if (this.spam.has(phone)) return false;
    this.spam.add(phone);
    return true;
  }

  async allowWriteAction(phone: string): Promise<boolean> {
    const now = Date.now();
    const recent = (this.writes.get(phone) ?? []).filter(
      (timestamp) => now - timestamp < WRITE_RATE_LIMIT_SECONDS * 1000
    );
    if (recent.length >= WRITE_RATE_LIMIT_MAX) {
      this.writes.set(phone, recent);
      return false;
    }
    recent.push(now);
    this.writes.set(phone, recent);
    return true;
  }

  async allowCampaign(barbershopId: string): Promise<boolean> {
    if (this.campaigns.has(barbershopId)) return false;
    this.campaigns.add(barbershopId);
    return true;
  }
}

export class RedisOwnerBotStore implements OwnerBotStore {
  private fallback = new InMemoryOwnerBotStore();

  constructor(private redis?: IORedis) {}

  private client(): IORedis {
    if (!this.redis) this.redis = getApiRedisConnection();
    return this.redis;
  }

  async getState(phone: string): Promise<OwnerBotConversationState | null> {
    try {
      const raw = await this.client().get(`${STATE_PREFIX}${phone}`);
      if (!raw) return null;
      return JSON.parse(raw) as OwnerBotConversationState;
    } catch (err) {
      logger.warn({ err }, "Redis indisponível ao ler o estado — usando memória");
      return this.fallback.getState(phone);
    }
  }

  async setState(phone: string, state: OwnerBotConversationState): Promise<void> {
    const payload = JSON.stringify(state);
    try {
      await this.client().set(`${STATE_PREFIX}${phone}`, payload, "EX", STATE_TTL_SECONDS);
    } catch (err) {
      logger.warn({ err }, "Redis indisponível ao gravar o estado — usando memória");
      await this.fallback.setState(phone, state);
    }
  }

  async clearState(phone: string): Promise<void> {
    try {
      await this.client().del(`${STATE_PREFIX}${phone}`);
    } catch (err) {
      logger.warn({ err }, "Redis indisponível ao limpar o estado — usando memória");
    }
    await this.fallback.clearState(phone);
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
      if (result === null) return true;
      return false;
    } catch (err) {
      // Sem Redis, o dedupe vira local ao processo: a mesma reentrega não é
      // processada duas vezes (o risco de duplicar uma ação cai).
      logger.warn({ err }, "Redis indisponível no dedupe — usando memória");
      return this.fallback.markMessageSeen(messageId);
    }
  }

  async allowUnlinkedReply(phone: string): Promise<boolean> {
    try {
      const result = await this.client().set(
        `${SPAM_PREFIX}${phone}`,
        "1",
        "EX",
        UNLINKED_RATE_LIMIT_SECONDS,
        "NX"
      );
      return result !== null;
    } catch (err) {
      logger.warn({ err }, "Redis indisponível no anti-spam — usando memória");
      return this.fallback.allowUnlinkedReply(phone);
    }
  }

  async allowWriteAction(phone: string): Promise<boolean> {
    try {
      const key = `${WRITE_PREFIX}${phone}`;
      const count = await this.client().incr(key);
      if (count === 1) await this.client().expire(key, WRITE_RATE_LIMIT_SECONDS);
      return count <= WRITE_RATE_LIMIT_MAX;
    } catch (err) {
      logger.warn({ err }, "Redis indisponível no limite de escritas — usando memória");
      return this.fallback.allowWriteAction(phone);
    }
  }

  async allowCampaign(barbershopId: string): Promise<boolean> {
    try {
      const result = await this.client().set(
        `${CAMPAIGN_PREFIX}${barbershopId}`,
        "1",
        "EX",
        CAMPAIGN_RATE_LIMIT_SECONDS,
        "NX"
      );
      return result !== null;
    } catch (err) {
      logger.warn({ err }, "Redis indisponível no limite de campanhas — usando memória");
      return this.fallback.allowCampaign(barbershopId);
    }
  }
}

/** Store padrão (Redis com fallback em memória). */
export function createOwnerBotStore(): OwnerBotStore {
  return new RedisOwnerBotStore();
}
