/**
 * Worker BullMQ do assistente de WhatsApp.
 *
 * Lazy com auto-stop — sobe quando há jobs e para após 60s ocioso, igual ao
 * worker de WhatsApp.
 */
import { Worker, Job } from "bullmq";
import { getRedisConnection } from "./redisConnection";
import { OwnerBotJobData } from "./ownerBotQueue";
import { getModuleLogger } from "@/shared/utils/logger";
import { jobCorrelationId, runWithCorrelationId } from "@/shared/utils/correlationContext";
import { OwnerBotService } from "@/modules/whatsappOwnerBot/ownerBotService";

const logger = getModuleLogger("queue:owner-bot");

const QUEUE_NAME = "owner-bot";
const IDLE_TIMEOUT_MS = 60_000;

let _worker: Worker<OwnerBotJobData> | null = null;
let _idleTimer: ReturnType<typeof setTimeout> | null = null;

function resetIdleTimer(): void {
  if (_idleTimer) clearTimeout(_idleTimer);
  _idleTimer = setTimeout(() => {
    void stopOwnerBotWorker();
  }, IDLE_TIMEOUT_MS);
}

function createWorker(): Worker<OwnerBotJobData> {
  const worker = new Worker<OwnerBotJobData>(
    QUEUE_NAME,
    (job: Job<OwnerBotJobData>) =>
      runWithCorrelationId(
        jobCorrelationId(QUEUE_NAME, job.id, job.data.correlationId),
        async () => {
          if (_idleTimer) clearTimeout(_idleTimer);
          const service = new OwnerBotService();
          await service.handleIncoming({
            messageId: job.data.messageId,
            phone: job.data.phone,
            text: job.data.text,
            instanceName: job.data.instanceName,
          });
          resetIdleTimer();
          return { handled: true };
        }
      ),
    {
      connection: getRedisConnection(),
      concurrency: 5,
      limiter: { max: 10, duration: 1000 },
    }
  );

  worker.on("failed", (job, err) => {
    logger.error(
      { err, jobId: job?.id, correlationId: job?.data?.correlationId },
      "Job do assistente falhou"
    );
    resetIdleTimer();
  });

  worker.on("error", (err) => {
    logger.error({ err }, "Worker do assistente com erro");
  });

  worker.on("ready", () => resetIdleTimer());

  return worker;
}

export const ownerBotWorker = new Proxy({} as Worker<OwnerBotJobData>, {
  get(_t, prop, receiver) {
    if (!_worker) _worker = createWorker();
    const value = Reflect.get(_worker, prop, receiver);
    return typeof value === "function" ? value.bind(_worker) : value;
  },
});

export async function ensureOwnerBotWorker(): Promise<void> {
  if (process.env.VITEST) return;
  if (!_worker) {
    _worker = createWorker();
    logger.info("Worker do assistente iniciado (on-demand)");
  }
  if (_idleTimer) clearTimeout(_idleTimer);
}

export async function startOwnerBotWorker(): Promise<void> {
  if (process.env.VITEST) return;
  if (!_worker) _worker = createWorker();
  logger.info("Worker do assistente iniciado");
}

export async function stopOwnerBotWorker(): Promise<void> {
  if (_idleTimer) {
    clearTimeout(_idleTimer);
    _idleTimer = null;
  }
  if (_worker) {
    await _worker.close();
    _worker = null;
    logger.info("Worker do assistente parado (ocioso)");
  }
}
