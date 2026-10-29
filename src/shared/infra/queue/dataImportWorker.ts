/**
 * Worker BullMQ da importação de planilhas.
 *
 * Lazy com auto-stop — sobe quando há lote na fila e para após 60s ocioso,
 * igual ao worker do assistente de WhatsApp.
 */
import { Worker, Job } from "bullmq";
import { getRedisConnection } from "./redisConnection";
import { DataImportJobData } from "./dataImportQueue";
import { getModuleLogger } from "@/shared/utils/logger";
import { jobCorrelationId, runWithCorrelationId } from "@/shared/utils/correlationContext";
import { processImportBatch } from "@/modules/dataImport/importProcessor";

const logger = getModuleLogger("queue:data-import");

const QUEUE_NAME = "data-import";
const IDLE_TIMEOUT_MS = 60_000;

let _worker: Worker<DataImportJobData> | null = null;
let _idleTimer: ReturnType<typeof setTimeout> | null = null;

function resetIdleTimer(): void {
  if (_idleTimer) clearTimeout(_idleTimer);
  _idleTimer = setTimeout(() => {
    void stopDataImportWorker();
  }, IDLE_TIMEOUT_MS);
}

function createWorker(): Worker<DataImportJobData> {
  const worker = new Worker<DataImportJobData>(
    QUEUE_NAME,
    (job: Job<DataImportJobData>) =>
      runWithCorrelationId(
        jobCorrelationId(QUEUE_NAME, job.id, job.data.correlationId),
        async () => {
          if (_idleTimer) clearTimeout(_idleTimer);
          const result = await processImportBatch(job.data.batchId);
          resetIdleTimer();
          return result;
        },
      ),
    {
      connection: getRedisConnection(),
      concurrency: 1,
      limiter: { max: 2, duration: 1000 },
    },
  );

  worker.on("failed", (job, err) => {
    logger.error(
      { err, jobId: job?.id, batchId: job?.data?.batchId },
      "Job de importação falhou",
    );
    resetIdleTimer();
  });

  worker.on("error", (err) => {
    logger.error({ err }, "Worker de importação com erro");
  });

  worker.on("ready", () => resetIdleTimer());

  return worker;
}

export const dataImportWorker = new Proxy({} as Worker<DataImportJobData>, {
  get(_t, prop, receiver) {
    if (!_worker) _worker = createWorker();
    const value = Reflect.get(_worker, prop, receiver);
    return typeof value === "function" ? value.bind(_worker) : value;
  },
});

export async function ensureDataImportWorker(): Promise<void> {
  if (process.env.VITEST) return;
  if (!_worker) {
    _worker = createWorker();
    logger.info("Worker de importação iniciado (on-demand)");
  }
  if (_idleTimer) clearTimeout(_idleTimer);
}

export async function startDataImportWorker(): Promise<void> {
  if (process.env.VITEST) return;
  if (!_worker) _worker = createWorker();
  logger.info("Worker de importação iniciado");
}

export async function stopDataImportWorker(): Promise<void> {
  if (_idleTimer) {
    clearTimeout(_idleTimer);
    _idleTimer = null;
  }
  if (_worker) {
    await _worker.close();
    _worker = null;
    logger.info("Worker de importação parado (ocioso)");
  }
}
