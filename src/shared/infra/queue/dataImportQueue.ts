/**
 * Fila BullMQ da importação de planilhas.
 *
 * O processamento é assíncrono: o dono confirma, a API responde na hora e o
 * worker cuida do lote (em pedaços de 200 linhas). O `jobId` é o id do lote
 * — reenfileirar o mesmo lote não cria um segundo processamento.
 */
import { Queue, QueueEvents } from "bullmq";
import { getRedisConnection } from "./redisConnection";
import { toBullJobId } from "./jobId";
import { getModuleLogger } from "@/shared/utils/logger";
import { getCorrelationId } from "@/shared/utils/correlationContext";

export interface DataImportJobData {
  batchId: string;
  correlationId?: string;
}

const QUEUE_NAME = "data-import";
const logger = getModuleLogger("queue:data-import");

let _queue: Queue<DataImportJobData> | null = null;
let _events: QueueEvents | null = null;

function getQueue(): Queue<DataImportJobData> {
  if (!_queue) {
    _queue = new Queue<DataImportJobData>(QUEUE_NAME, {
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

export const dataImportQueue = new Proxy({} as Queue<DataImportJobData>, {
  get(_t, prop, receiver) {
    const q = getQueue();
    const value = Reflect.get(q, prop, receiver);
    return typeof value === "function" ? value.bind(q) : value;
  },
});

export const dataImportQueueEvents = new Proxy({} as QueueEvents, {
  get(_t, prop, receiver) {
    const e = getEvents();
    const value = Reflect.get(e, prop, receiver);
    return typeof value === "function" ? value.bind(e) : value;
  },
});

/** Enfileira o processamento de um lote. */
export async function enqueueDataImportBatch(batchId: string): Promise<void> {
  if (process.env.VITEST) return;
  const { ensureDataImportWorker } = await import("./dataImportWorker");
  await ensureDataImportWorker();
  const jobId = toBullJobId(`import-${batchId}`);
  await getQueue().add(
    "process",
    { batchId, correlationId: getCorrelationId() },
    { jobId },
  );
  logger.info({ batchId }, "Lote de importação enfileirado");
}
