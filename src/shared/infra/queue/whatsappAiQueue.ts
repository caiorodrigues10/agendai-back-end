/**
 * Fila BullMQ das mensagens recebidas pelo atendente de IA.
 *
 * Mesma ideia do assistente do dono: o webhook responde 200 na hora e o
 * processamento (resolver salão, montar a resposta, enviar) acontece no
 * worker, com retry.
 */
import { Queue, QueueEvents } from "bullmq";
import { getRedisConnection } from "./redisConnection";
import { toBullJobId } from "./jobId";
import { getModuleLogger } from "@/shared/utils/logger";
import { getCorrelationId } from "@/shared/utils/correlationContext";

export interface WhatsAppAiJobData {
  messageId: string;
  phone: string;
  text: string;
  instanceName?: string;
  correlationId?: string;
}

const QUEUE_NAME = "whatsapp-ai";
const logger = getModuleLogger("queue:whatsapp-ai");

let _queue: Queue<WhatsAppAiJobData> | null = null;
let _events: QueueEvents | null = null;

function getQueue(): Queue<WhatsAppAiJobData> {
  if (!_queue) {
    _queue = new Queue<WhatsAppAiJobData>(QUEUE_NAME, {
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

export const whatsappAiQueue = new Proxy({} as Queue<WhatsAppAiJobData>, {
  get(_t, prop, receiver) {
    const q = getQueue();
    const value = Reflect.get(q, prop, receiver);
    return typeof value === "function" ? value.bind(q) : value;
  },
});

export const whatsappAiQueueEvents = new Proxy({} as QueueEvents, {
  get(_t, prop, receiver) {
    const e = getEvents();
    const value = Reflect.get(e, prop, receiver);
    return typeof value === "function" ? value.bind(e) : value;
  },
});

/**
 * Enfileira a mensagem. O jobId vem do id da mensagem na Evolution — assim a
 * reentrega do webhook não vira um segundo processamento.
 */
export async function enqueueWhatsAppAiMessage(data: WhatsAppAiJobData): Promise<void> {
  if (process.env.VITEST) return;
  const { ensureWhatsAppAiWorker } = await import("./whatsappAiWorker");
  await ensureWhatsAppAiWorker();
  const jobId = toBullJobId(`whatsappai-${data.messageId}`);
  await getQueue().add(
    "handle",
    { ...data, correlationId: data.correlationId ?? getCorrelationId() },
    { jobId }
  );
  logger.debug({ messageId: data.messageId }, "Mensagem do atendente de IA enfileirada");
}
