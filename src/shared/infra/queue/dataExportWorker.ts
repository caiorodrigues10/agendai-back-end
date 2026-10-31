/**
 * Worker BullMQ da exportação de planilhas.
 *
 * Lazy com auto-stop — sobe quando há pedido na fila e para após 60s ocioso,
 * igual ao worker de importação.
 */
import { Worker, Job } from "bullmq";
import { getRedisConnection } from "./redisConnection";
import { DataExportJobData } from "./dataExportQueue";
import { getModuleLogger } from "@/shared/utils/logger";
import { jobCorrelationId, runWithCorrelationId } from "@/shared/utils/correlationContext";
import { processExportJob } from "@/modules/dataExport/exportProcessor";

const logger = getModuleLogger("queue:data-export");

const QUEUE_NAME = "data-export";
const IDLE_TIMEOUT_MS = 60_000;

let _worker: Worker<DataExportJobData> | null = null;
let _idleTimer: ReturnType<typeof setTimeout> | null = null;

function resetIdleTimer(): void {
  if (_idleTimer) clearTimeout(_idleTimer);
  _idleTimer = setTimeout(() => {
    void stopDataExportWorker();
  }, IDLE_TIMEOUT_MS);
}

function createWorker(): Worker<DataExportJobData> {
  const worker = new Worker<DataExportJobData>(
    QUEUE_NAME,
    (job: Job<DataExportJobData>) =>
      runWithCorrelationId(
        jobCorrelationId(QUEUE_NAME, job.id, job.data.correlationId),
        async () => {
          if (_idleTimer) clearTimeout(_idleTimer);
          const result = await processExportJob(job.data.exportId, job.data.barbershopId);
          resetIdleTimer();
          return result;
        },
      ),
    {
      connection: getRedisConnection(),
      concurrency: 1,
      limiter: { max: 1, duration: 5000 },
    },
  );

  worker.on("failed", (job, err) => {
    logger.error(
      { err, jobId: job?.id, exportId: job?.data?.exportId },
      "Job de exportação falhou",
    );
    resetIdleTimer();
  });

  worker.on("error", (err) => {
    logger.error({ err }, "Worker de exportação com erro");
  });

  worker.on("ready", () => resetIdleTimer());

  return worker;
}

export const dataExportWorker = new Proxy({} as Worker<DataExportJobData>, {
  get(_t, prop, receiver) {
    if (!_worker) _worker = createWorker();
    const value = Reflect.get(_worker, prop, receiver);
    return typeof value === "function" ? value.bind(_worker) : value;
  },
});

export async function ensureDataExportWorker(): Promise<void> {
  if (process.env.VITEST) return;
  if (!_worker) {
    _worker = createWorker();
    logger.info("Worker de exportação iniciado (on-demand)");
  }
  if (_idleTimer) clearTimeout(_idleTimer);
}

export async function startDataExportWorker(): Promise<void> {
  if (process.env.VITEST) return;
  if (!_worker) _worker = createWorker();
  logger.info("Worker de exportação iniciado");
}

export async function stopDataExportWorker(): Promise<void> {
  if (_idleTimer) {
    clearTimeout(_idleTimer);
    _idleTimer = null;
  }
  if (_worker) {
    await _worker.close();
    _worker = null;
    logger.info("Worker de exportação parado (ocioso)");
  }
}
