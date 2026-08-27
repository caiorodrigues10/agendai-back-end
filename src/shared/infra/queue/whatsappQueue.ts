/**
 * Fila BullMQ para envio de WhatsApp via Evolution API.
 * Instanciação lazy — em VITEST, enqueue é no-op (sem Redis).
 */
import { Queue, QueueEvents } from "bullmq";
import { getRedisConnection } from "./redisConnection";

export interface WhatsAppJobData {
  phone: string;
  message: string;
  instanceName?: string;
  /** Mensagem da plataforma (contato/indicação) — pode usar instância global da env. */
  platform?: boolean;
  /** Chave de deduplicação (ex: "join:barbershopId:queueItemId") */
  deduplicationKey?: string;
}

const QUEUE_NAME = "whatsapp";

let _queue: Queue<WhatsAppJobData> | null = null;
let _events: QueueEvents | null = null;

function getQueue(): Queue<WhatsAppJobData> {
  if (!_queue) {
    _queue = new Queue<WhatsAppJobData>(QUEUE_NAME, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: { age: 3600 },
        removeOnFail: { age: 86400 },
      },
    });
  }
  return _queue;
}

function getEvents(): QueueEvents {
  if (!_events) {
    _events = new QueueEvents(QUEUE_NAME, {
      connection: getRedisConnection(),
    });
  }
  return _events;
}

/** Lazy — só cria fila ao acessar fora de testes. */
export const whatsappQueue = new Proxy({} as Queue<WhatsAppJobData>, {
  get(_t, prop, receiver) {
    const q = getQueue();
    const value = Reflect.get(q, prop, receiver);
    return typeof value === "function" ? value.bind(q) : value;
  },
});

export const whatsappQueueEvents = new Proxy({} as QueueEvents, {
  get(_t, prop, receiver) {
    const e = getEvents();
    const value = Reflect.get(e, prop, receiver);
    return typeof value === "function" ? value.bind(e) : value;
  },
});

export async function enqueueWhatsApp(data: WhatsAppJobData): Promise<void> {
  if (process.env.VITEST) return;
  if (!data.platform && !data.instanceName?.trim()) return;
  const { ensureWhatsAppWorker } = await import("./whatsappWorker");
  await ensureWhatsAppWorker();
  const jobId = data.deduplicationKey || undefined;
  await getQueue().add("send", data, { jobId });
}
