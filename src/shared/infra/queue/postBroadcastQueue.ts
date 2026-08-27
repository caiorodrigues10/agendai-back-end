/**
 * Fila BullMQ para broadcast de posts publicados via WhatsApp.
 * Envia imagem (base64) + legenda para todos os clientes da barbearia.
 */
import { Queue, QueueEvents } from "bullmq";
import { getRedisConnection } from "./redisConnection";

export interface PostBroadcastJobData {
  postId: string;
  barbershopId: string;
  /** Base64 raw (sem prefixo data:image…) da imagem PNG do post. */
  imageBase64: string;
  /** Texto da legenda (título + CTA). */
  caption: string;
  /** Nome da instância Evolution API da barbearia (sem fallback global). */
  instanceName?: string;
  /** Telefone normalizado do cliente destinatário. */
  clientPhone: string;
  /** Chave de deduplicação (ex: "post-broadcast:postId:clientId"). */
  deduplicationKey?: string;
}

const QUEUE_NAME = "post-broadcast";

let _queue: Queue<PostBroadcastJobData> | null = null;
let _events: QueueEvents | null = null;

function getQueue(): Queue<PostBroadcastJobData> {
  if (!_queue) {
    _queue = new Queue<PostBroadcastJobData>(QUEUE_NAME, {
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
export const postBroadcastQueue = new Proxy({} as Queue<PostBroadcastJobData>, {
  get(_t, prop, receiver) {
    const q = getQueue();
    const value = Reflect.get(q, prop, receiver);
    return typeof value === "function" ? value.bind(q) : value;
  },
});

export const postBroadcastQueueEvents = new Proxy({} as QueueEvents, {
  get(_t, prop, receiver) {
    const e = getEvents();
    const value = Reflect.get(e, prop, receiver);
    return typeof value === "function" ? value.bind(e) : value;
  },
});

export async function enqueuePostBroadcast(
  data: PostBroadcastJobData
): Promise<void> {
  if (process.env.VITEST) return;
  if (!data.instanceName?.trim()) return;
  const { ensurePostBroadcastWorker } = await import("./postBroadcastWorker");
  await ensurePostBroadcastWorker();
  const jobId = data.deduplicationKey || undefined;
  await getQueue().add("send-media", data, { jobId });
}
