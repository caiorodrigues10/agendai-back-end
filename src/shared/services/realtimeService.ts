/**
 * Hub de realtime: fanout em WebSocket + Redis pub/sub multi-instância.
 *
 * Os eventos carregam apenas sinais de invalidação (sem PII). Os testes
 * unitários ficam em memória porque getRedisConnection() é bloqueado sob
 * VITEST.
 *
 * Retomada do pub/sub: `start()` tenta conectar uma vez e, se falhar — ou se o
 * publisher/subscriber emitir erro depois — o hub agenda retomada em background
 * com backoff exponencial + jitter (1s, 2s, 4s … teto de 30s) até conectar.
 * Só existe uma tentativa em voo por vez (`connecting`) e os clientes antigos
 * são fechados antes de serem substituídos, então nunca ficam conexões
 * duplicadas; o `psubscribe` é refeito a cada reconexão. Os clientes próprios
 * são criados com fail-fast (`retryStrategy` nula e sem offline queue): quem
 * comanda a retomada é o hub, não o ioredis, e `publish()` não pode ficar
 * pendurado enfileirado quando o socket caiu.
 */
import { EventEmitter } from "node:events";
import type { WebSocket } from "ws";
import type { RedisOptions } from "ioredis";
import { getModuleLogger } from "@/shared/utils/logger";

export type RealtimeTopic = "queue:changed" | "appointments:changed";

export interface RealtimeEvent {
  type: RealtimeTopic;
  barbershopId: string;
}

const CHANNEL_PREFIX = "agendai:realtime:";
const MAX_SOCKETS_PER_SHOP = 100;

/**
 * Teto global de sockets por instância: 50 salões × `MAX_SOCKETS_PER_SHOP`.
 * Protege a instância inteira (memória e file descriptors) quando há muitos
 * salões simultâneos, cenário que o limite por salão sozinho não cobre.
 */
const MAX_SOCKETS_TOTAL = 5_000;

/**
 * Teto de dados pendurados no buffer de envio de um socket (1 MB). Acima disso
 * o cliente deixou de consumir a mensagem e manter o socket só acumula memória.
 */
const MAX_BUFFERED_BYTES = 1_048_576;

const RETRY_BASE_MS = 1_000;
const RETRY_MAX_MS = 30_000;
const WS_OPEN = 1;
const SUBSCRIBE_PATTERN = `${CHANNEL_PREFIX}*`;

const logger = getModuleLogger("realtime");

/**
 * Opções dos clientes duplicados do hub: sem retry interno e sem offline queue,
 * para que `connect()`/`publish()` falhem rápido e a retomada fique inteiramente
 * sob o backoff do hub.
 */
const DUPLICATE_OPTIONS: RedisOptions = {
  retryStrategy: () => null,
  enableOfflineQueue: false,
};

type SendableSocket = Pick<WebSocket, "send" | "readyState"> & {
  /**
   * Bytes já enfileirados para envio. É uma propriedade nativa de
   * `ws.WebSocket`; fica opcional aqui só para aceitar sockets de teste.
   */
  bufferedAmount?: number;
};

type RedisClient = {
  duplicate: (override?: RedisOptions) => RedisClient;
  connect: () => Promise<unknown>;
  publish: (channel: string, message: string) => Promise<number>;
  psubscribe: (pattern: string) => Promise<unknown>;
  quit: () => Promise<unknown>;
  on: (event: string, listener: (...args: unknown[]) => void) => void;
  disconnect?: () => void;
};

function channelName(barbershopId: string): string {
  return `${CHANNEL_PREFIX}${barbershopId}`;
}

function isRealtimeEvent(value: unknown): value is RealtimeEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as RealtimeEvent;
  return (
    (event.type === "queue:changed" || event.type === "appointments:changed") &&
    typeof event.barbershopId === "string" &&
    event.barbershopId.length > 0
  );
}

async function closeClient(client: RedisClient | null): Promise<void> {
  if (!client) return;
  try {
    await client.quit();
  } catch {
    try {
      client.disconnect?.();
    } catch {
      /* conexão já morta */
    }
  }
}

export class RealtimeHub {
  private readonly local = new EventEmitter();
  private readonly sockets = new Map<string, Set<SendableSocket>>();
  /** Ordem global de entrada: permite derrubar o socket mais antigo da instância em O(1). */
  private readonly registry = new Map<SendableSocket, string>();
  private publisher: RedisClient | null = null;
  private subscriber: RedisClient | null = null;
  private redisLive = false;
  private started = false;
  private connecting = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryAttempt = 0;

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    if (process.env.VITEST && process.env.ALLOW_TEST_REDIS !== "1") {
      return;
    }

    await this.connect();
  }

  /**
   * Derruba o pub/sub: cancela o retry pendente, fecha o subscriber antes do
   * publisher (para de receber antes de deixar de publicar) e limpa os sockets.
   * Nunca lança: `quit()` de conexão já morta é engolido com fallback em
   * `disconnect()`.
   */
  async stop(): Promise<void> {
    this.started = false;
    this.redisLive = false;
    this.clearRetry();
    this.retryAttempt = 0;
    const subscriber = this.subscriber;
    const publisher = this.publisher;
    this.subscriber = null;
    this.publisher = null;
    await closeClient(subscriber);
    await closeClient(publisher);
    this.sockets.clear();
    this.registry.clear();
  }

  /**
   * Registra um socket no salão respeitando dois tetos: por salão
   * (`MAX_SOCKETS_PER_SHOP`) e global da instância (`MAX_SOCKETS_TOTAL`).
   *
   * Quando os dois estouram ao mesmo tempo vale a política **global**: derruba-se
   * sempre o socket mais antigo da instância inteira, e não o do salão que acabou
   * de conectar. A saturação global é risco de queda do processo (memória/fds),
   * então ela precisa reduzir o total imediatamente; removendo um socket do
   * salão em questão o contador global não recuaria se outro salão estiver
   * inflado. O limite por salão continua valendo isolado, sozinho.
   */
  addConnection(barbershopId: string, socket: SendableSocket): void {
    let set = this.sockets.get(barbershopId);
    if (!set) {
      set = new Set();
      this.sockets.set(barbershopId, set);
    }
    this.registry.delete(socket);
    set.add(socket);
    this.registry.set(socket, barbershopId);

    while (this.registry.size > MAX_SOCKETS_TOTAL) {
      const oldest = this.registry.entries().next().value;
      if (!oldest) break;
      this.dropSocket(oldest[1], oldest[0]);
    }

    while (set.size > MAX_SOCKETS_PER_SHOP) {
      const oldest = set.values().next().value;
      if (!oldest) break;
      this.dropSocket(barbershopId, oldest);
    }
  }

  removeConnection(barbershopId: string, socket: SendableSocket): void {
    this.dropSocket(barbershopId, socket);
  }

  async publish(barbershopId: string, topic: RealtimeTopic): Promise<void> {
    if (!barbershopId) return;
    const event: RealtimeEvent = { type: topic, barbershopId };

    if (this.redisLive && this.publisher) {
      const publisher = this.publisher;
      try {
        await publisher.publish(channelName(barbershopId), JSON.stringify(event));
        return;
      } catch (err) {
        this.handleConnectionLoss(publisher, err);
        logger.warn({ err }, "Realtime Redis publish failed — falling back to memory");
      }
    }

    this.fanout(event);
  }

  /** Auxílio de teste: escuta o fanout em memória sem sockets. */
  onLocal(listener: (event: RealtimeEvent) => void): () => void {
    this.local.on("event", listener);
    return () => this.local.off("event", listener);
  }

  private async connect(): Promise<void> {
    if (!this.started || this.connecting || this.redisLive) return;
    this.connecting = true;
    const created: RedisClient[] = [];
    try {
      const { getRedisConnection } = await import("@/shared/infra/queue/redisConnection");
      const base = getRedisConnection() as unknown as RedisClient;
      const publisher = base.duplicate(DUPLICATE_OPTIONS);
      const subscriber = base.duplicate(DUPLICATE_OPTIONS);
      created.push(publisher, subscriber);
      publisher.on("error", (err) => this.handleConnectionLoss(publisher, err));
      subscriber.on("error", (err) => this.handleConnectionLoss(subscriber, err));
      await Promise.all([publisher.connect(), subscriber.connect()]);
      await subscriber.psubscribe(SUBSCRIBE_PATTERN);
      subscriber.on("pmessage", (...args: unknown[]) => {
        const message = args[2];
        if (typeof message !== "string") return;
        try {
          const parsed: unknown = JSON.parse(message);
          if (isRealtimeEvent(parsed)) this.fanout(parsed);
        } catch {
          /* ignora payloads malformados */
        }
      });
      if (!this.started) {
        await Promise.all(created.map(closeClient));
        return;
      }
      this.publisher = publisher;
      this.subscriber = subscriber;
      this.redisLive = true;
      this.retryAttempt = 0;
      logger.info("Realtime Redis pub/sub connected");
    } catch (err) {
      this.redisLive = false;
      await Promise.all(created.map(closeClient));
      logger.warn({ err }, "Realtime Redis unavailable — in-memory fanout + retry agendado");
      this.scheduleRetry();
    } finally {
      this.connecting = false;
    }
  }

  private handleConnectionLoss(client: RedisClient, err?: unknown): void {
    if (!this.started) return;
    if (client !== this.publisher && client !== this.subscriber) return;
    this.redisLive = false;
    const stale = [this.subscriber, this.publisher];
    this.subscriber = null;
    this.publisher = null;
    void Promise.all(stale.map(closeClient));
    logger.warn({ err }, "Realtime Redis connection lost — retomando pub/sub");
    this.scheduleRetry();
  }

  /**
   * Backoff exponencial com jitter de 50% (1s → 2s → 4s … teto de 30s): o jitter
   * evita que várias instâncias atacem o Redis de novo no mesmo instante após uma
   * queda comum. Só agenda se o hub estiver rodando e não houver retry pendente.
   */
  private scheduleRetry(): void {
    if (!this.started || this.retryTimer) return;
    this.retryAttempt += 1;
    const exponential = RETRY_BASE_MS * 2 ** Math.min(this.retryAttempt - 1, 20);
    const capped = Math.min(exponential, RETRY_MAX_MS);
    const delay = Math.round(capped / 2 + Math.random() * (capped / 2));
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.connect();
    }, delay);
    this.retryTimer.unref?.();
    logger.debug(
      { attempt: this.retryAttempt, delayMs: delay },
      "Realtime Redis retry agendado"
    );
  }

  private clearRetry(): void {
    if (!this.retryTimer) return;
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private dropSocket(barbershopId: string, socket: SendableSocket): void {
    const set = this.sockets.get(barbershopId);
    if (set) {
      set.delete(socket);
      if (set.size === 0) this.sockets.delete(barbershopId);
    }
    this.registry.delete(socket);
  }

  private fanout(event: RealtimeEvent): void {
    this.local.emit("event", event);
    const payload = JSON.stringify(event);
    const set = this.sockets.get(event.barbershopId);
    if (!set) return;
    for (const socket of set) {
      if (socket.readyState !== WS_OPEN) {
        this.dropSocket(event.barbershopId, socket);
        continue;
      }
      if (
        typeof socket.bufferedAmount === "number" &&
        socket.bufferedAmount > MAX_BUFFERED_BYTES
      ) {
        logger.warn(
          { barbershopId: event.barbershopId, bufferedAmount: socket.bufferedAmount },
          "Realtime socket sem consumir dados — descartado"
        );
        this.dropSocket(event.barbershopId, socket);
        continue;
      }
      try {
        socket.send(payload);
      } catch {
        this.dropSocket(event.barbershopId, socket);
      }
    }
  }
}

export const realtimeHub = new RealtimeHub();

export function publishRealtime(barbershopId: string, topic: RealtimeTopic): void {
  if (!barbershopId) return;
  void realtimeHub.publish(barbershopId, topic);
}
