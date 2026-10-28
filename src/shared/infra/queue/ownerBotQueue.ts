/**
 * Fila BullMQ das mensagens recebidas pelo assistente de WhatsApp.
 *
 * A entrada é assíncrona de propósito: o webhook responde 200 na hora e o
 * processamento acontece no worker, com retry e limite por número.
 */
import { Queue, QueueEvents } from "bullmq";
import { getRedisConnection } from "./redisConnection";
import { toBullJobId } from "./jobId";
import { getModuleLogger } from "@/shared/utils/logger";
import { getCorrelationId } from "@/shared/utils/correlationContext";

export interface OwnerBotJobData {
  messageId: string;
  phone: string;
  text: string;
  instanceName?: string;
  correlationId?: string;
}

const QUEUE_NAME = "owner-bot";
const logger = getModuleLogger("queue:owner-bot");

let _queue: Queue<OwnerBotJobData> | null = null;
let _events: QueueEvents | null = null;

function getQueue(): Queue<OwnerBotJobData> {
  if (!_queue) {
    _queue = new Queue<OwnerBotJobData>(QUEUE_NAME, {
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
    _events = new QueueEvents(QUEUE_NAME, { connection: getRedisConnection() });
  }
  return _events;
}

export const ownerBotQueue = new Proxy({} as Queue<OwnerBotJobData>, {
  get(_t, prop, receiver) {
    const q = getQueue();
    const value = Reflect.get(q, prop, receiver);
    return typeof value === "function" ? value.bind(q) : value;
  },
});

export const ownerBotQueueEvents = new Proxy({} as QueueEvents, {
  get(_t, prop, receiver) {
    const e = getEvents();
    const value = Reflect.get(e, prop, receiver);
    return typeof value === "function" ? value.bind(e) : value;
  },
});

/**
 * Enfileira a mensagem. O jobId é o id da mensagem na Evolution — assim a
 * reentrega do webhook não vira um segundo processamento.
 */
export async function enqueueOwnerBotMessage(data: OwnerBotJobData): Promise<void> {
  if (process.env.VITEST) return;
  const { ensureOwnerBotWorker } = await import("./ownerBotWorker");
  await ensureOwnerBotWorker();
  const jobId = toBullJobId(`ownerbot-${data.messageId}`);
  await getQueue().add(
    "handle",
    { ...data, correlationId: data.correlationId ?? getCorrelationId() },
    { jobId }
  );
  logger.debug({ messageId: data.messageId }, "Mensagem do assistente enfileirada");
}
