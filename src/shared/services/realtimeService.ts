/**
 * Realtime hub: WebSocket fanout + Redis pub/sub for multi-instance.
 *
 * Events carry only invalidation signals (no PII). Unit tests stay in-memory
 * because getRedisConnection() is blocked under VITEST.
 */
import { EventEmitter } from "node:events";
import type { WebSocket } from "ws";
import { getModuleLogger } from "@/shared/utils/logger";

export type RealtimeTopic = "queue:changed" | "appointments:changed";

export interface RealtimeEvent {
  type: RealtimeTopic;
  barbershopId: string;
}

const CHANNEL_PREFIX = "agendai:realtime:";
const MAX_SOCKETS_PER_SHOP = 100;
const WS_OPEN = 1;

const logger = getModuleLogger("realtime");

type SendableSocket = Pick<WebSocket, "send" | "readyState">;

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

export class RealtimeHub {
  private readonly local = new EventEmitter();
  private readonly sockets = new Map<string, Set<SendableSocket>>();
  private publisher: { publish: (channel: string, message: string) => Promise<number> } | null = null;
  private subscriber: {
    psubscribe: (pattern: string) => Promise<unknown>;
    quit: () => Promise<unknown>;
    on: (event: string, listener: (...args: unknown[]) => void) => void;
  } | null = null;
  private redisLive = false;
  private started = false;

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    if (process.env.VITEST && process.env.ALLOW_TEST_REDIS !== "1") {
      return;
    }

    try {
      const { getRedisConnection } = await import("@/shared/infra/queue/redisConnection");
      const base = getRedisConnection();
      const publisher = base.duplicate();
      const subscriber = base.duplicate();
      await Promise.all([publisher.connect(), subscriber.connect()]);
      await subscriber.psubscribe(`${CHANNEL_PREFIX}*`);
      subscriber.on("pmessage", (_pattern: string, _channel: string, message: string) => {
        try {
          const parsed: unknown = JSON.parse(message);
          if (isRealtimeEvent(parsed)) this.fanout(parsed);
        } catch {
          /* ignore malformed payloads */
        }
      });
      this.publisher = publisher;
      this.subscriber = subscriber;
      this.redisLive = true;
      logger.info("Realtime Redis pub/sub connected");
    } catch (err) {
      this.redisLive = false;
      logger.warn({ err }, "Realtime Redis unavailable — using in-memory fanout");
    }
  }

  async stop(): Promise<void> {
    this.started = false;
    this.redisLive = false;
    try {
      await this.subscriber?.quit();
    } catch {
      /* ignore */
    }
    this.publisher = null;
    this.subscriber = null;
    this.sockets.clear();
  }

  addConnection(barbershopId: string, socket: SendableSocket): void {
    let set = this.sockets.get(barbershopId);
    if (!set) {
      set = new Set();
      this.sockets.set(barbershopId, set);
    }
    if (set.size >= MAX_SOCKETS_PER_SHOP) {
      const oldest = set.values().next().value;
      if (oldest) set.delete(oldest);
    }
    set.add(socket);
  }

  removeConnection(barbershopId: string, socket: SendableSocket): void {
    const set = this.sockets.get(barbershopId);
    if (!set) return;
    set.delete(socket);
    if (set.size === 0) this.sockets.delete(barbershopId);
  }

  async publish(barbershopId: string, topic: RealtimeTopic): Promise<void> {
    if (!barbershopId) return;
    const event: RealtimeEvent = { type: topic, barbershopId };

    if (this.redisLive && this.publisher) {
      try {
        await this.publisher.publish(channelName(barbershopId), JSON.stringify(event));
        return;
      } catch (err) {
        this.redisLive = false;
        logger.warn({ err }, "Realtime Redis publish failed — falling back to memory");
      }
    }

    this.fanout(event);
  }

  /** Test helper: listen to in-memory fanout without sockets. */
  onLocal(listener: (event: RealtimeEvent) => void): () => void {
    this.local.on("event", listener);
    return () => this.local.off("event", listener);
  }

  private fanout(event: RealtimeEvent): void {
    this.local.emit("event", event);
    const payload = JSON.stringify(event);
    const set = this.sockets.get(event.barbershopId);
    if (!set) return;
    for (const socket of set) {
      if (socket.readyState !== WS_OPEN) {
        set.delete(socket);
        continue;
      }
      try {
        socket.send(payload);
      } catch {
        set.delete(socket);
      }
    }
  }
}

export const realtimeHub = new RealtimeHub();

export function publishRealtime(barbershopId: string, topic: RealtimeTopic): void {
  if (!barbershopId) return;
  void realtimeHub.publish(barbershopId, topic);
}
