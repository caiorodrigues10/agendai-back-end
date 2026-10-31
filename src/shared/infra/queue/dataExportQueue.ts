/**
 * Fila BullMQ da exportação de planilhas.
 *
 * O processamento é assíncrono: a API cria o pedido e responde na hora; o
 * worker gera o arquivo (que pode levar minutos em um backup completo). O
 * `jobId` é o id do pedido — reenfileirar o mesmo pedido não gera um segundo
 * arquivo.
 */
import { Queue, QueueEvents } from "bullmq";
import { getRedisConnection } from "./redisConnection";
import { toBullJobId } from "./jobId";
import { getModuleLogger } from "@/shared/utils/logger";
import { getCorrelationId } from "@/shared/utils/correlationContext";

export interface DataExportJobData {
  exportId: string;
  barbershopId: string;
  correlationId?: string;
}

const QUEUE_NAME = "data-export";
const logger = getModuleLogger("queue:data-export");

let _queue: Queue<DataExportJobData> | null = null;
let _events: QueueEvents | null = null;

function getQueue(): Queue<DataExportJobData> {
  if (!_queue) {
    _queue = new Queue<DataExportJobData>(QUEUE_NAME, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: "exponential", delay: 3000 },
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

export const dataExportQueue = new Proxy({} as Queue<DataExportJobData>, {
  get(_t, prop, receiver) {
    const q = getQueue();
    const value = Reflect.get(q, prop, receiver);
    return typeof value === "function" ? value.bind(q) : value;
  },
});

export const dataExportQueueEvents = new Proxy({} as QueueEvents, {
  get(_t, prop, receiver) {
    const e = getEvents();
    const value = Reflect.get(e, prop, receiver);
    return typeof value === "function" ? value.bind(e) : value;
  },
});

/** Enfileira a geração de uma exportação. */
export async function enqueueDataExport(exportId: string, barbershopId: string): Promise<void> {
  if (process.env.VITEST) return;
  const { ensureDataExportWorker } = await import("./dataExportWorker");
  await ensureDataExportWorker();
  const jobId = toBullJobId(`export-${exportId}`);
  await getQueue().add(
    "generate",
    { exportId, barbershopId, correlationId: getCorrelationId() },
    { jobId },
  );
  logger.info({ exportId, barbershopId }, "Exportação enfileirada");
}
