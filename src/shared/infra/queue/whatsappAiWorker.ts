/**
 * Worker BullMQ do atendente de IA.
 *
 * Lazy com auto-stop — sobe quando há jobs e para após 60s ocioso, igual ao
 * worker do assistente do dono.
 */
import { Worker, Job } from "bullmq";
import { getRedisConnection } from "./redisConnection";
import { WhatsAppAiJobData } from "./whatsappAiQueue";
import { getModuleLogger } from "@/shared/utils/logger";
import { jobCorrelationId, runWithCorrelationId } from "@/shared/utils/correlationContext";
import { WhatsAppAiService } from "@/modules/whatsappAi/whatsappAiService";

const logger = getModuleLogger("queue:whatsapp-ai");

const QUEUE_NAME = "whatsapp-ai";
const IDLE_TIMEOUT_MS = 60_000;

let _worker: Worker<WhatsAppAiJobData> | null = null;
let _idleTimer: ReturnType<typeof setTimeout> | null = null;

function resetIdleTimer(): void {
  if (_idleTimer) clearTimeout(_idleTimer);
  _idleTimer = setTimeout(() => {
    void stopWhatsAppAiWorker();
  }, IDLE_TIMEOUT_MS);
}

function createWorker(): Worker<WhatsAppAiJobData> {
  const worker = new Worker<WhatsAppAiJobData>(
    QUEUE_NAME,
    (job: Job<WhatsAppAiJobData>) =>
      runWithCorrelationId(
        jobCorrelationId(QUEUE_NAME, job.id, job.data.correlationId),
        async () => {
          if (_idleTimer) clearTimeout(_idleTimer);
          const service = new WhatsAppAiService();
          const outcome = await service.handleIncoming({
            messageId: job.data.messageId,
            phone: job.data.phone,
            text: job.data.text,
            instanceName: job.data.instanceName,
          });
          resetIdleTimer();
          return outcome;
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
      "Job do atendente de IA falhou"
    );
    resetIdleTimer();
  });

  worker.on("error", (err) => {
    logger.error({ err }, "Worker do atendente de IA com erro");
  });

  worker.on("ready", () => resetIdleTimer());

  return worker;
}

export const whatsappAiWorker = new Proxy({} as Worker<WhatsAppAiJobData>, {
  get(_t, prop, receiver) {
    if (!_worker) _worker = createWorker();
    const value = Reflect.get(_worker, prop, receiver);
    return typeof value === "function" ? value.bind(_worker) : value;
  },
});

export async function ensureWhatsAppAiWorker(): Promise<void> {
  if (process.env.VITEST) return;
  if (!_worker) {
    _worker = createWorker();
    logger.info("Worker do atendente de IA iniciado (on-demand)");
  }
  if (_idleTimer) clearTimeout(_idleTimer);
}

export async function startWhatsAppAiWorker(): Promise<void> {
  if (process.env.VITEST) return;
  if (!_worker) _worker = createWorker();
  logger.info("Worker do atendente de IA iniciado");
}

export async function stopWhatsAppAiWorker(): Promise<void> {
  if (_idleTimer) {
    clearTimeout(_idleTimer);
    _idleTimer = null;
  }
  if (_worker) {
    await _worker.close();
    _worker = null;
    logger.info("Worker do atendente de IA parado (ocioso)");
  }
}
