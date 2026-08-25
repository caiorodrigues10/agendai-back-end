/**
 * Worker BullMQ para envio de WhatsApp.
 * Instanciação lazy — só sobe no bootstrap de produção (startWhatsAppWorker).
 */
import { Worker, Job } from "bullmq";
import { getRedisConnection } from "./redisConnection";
import { WhatsAppJobData } from "./whatsappQueue";
import { sendWhatsAppMessage } from "@/shared/services/evolutionApiService";
import { getModuleLogger } from "@/shared/utils/logger";

const logger = getModuleLogger('queue:whatsapp');

const QUEUE_NAME = "whatsapp";

let _worker: Worker<WhatsAppJobData> | null = null;

function createWorker(): Worker<WhatsAppJobData> {
  const worker = new Worker<WhatsAppJobData>(
    QUEUE_NAME,
    async (job: Job<WhatsAppJobData>) => {
      const { phone, message, instanceName } = job.data;

      logger.debug({ jobId: job.id, attempt: job.attemptsMade + 1, maxAttempts: job.opts.attempts }, 'Processing WhatsApp job');

      const sent = await sendWhatsAppMessage(phone, message, {
        instanceName: instanceName || undefined,
      });

      if (!sent) {
        throw new Error(`Falha ao enviar WhatsApp`);
      }

      return { sent: true };
    },
    {
      connection: getRedisConnection(),
      concurrency: 5,
      limiter: { max: 10, duration: 1000 },
    }
  );

  worker.on("failed", (job, err) => {
    logger.error({ err, jobId: job?.id }, 'WhatsApp job failed');
  });

  worker.on("error", (err) => {
    logger.error({ err }, 'WhatsApp worker error');
  });

  return worker;
}

/** Proxy legado — evita Worker no import de unit tests. */
export const whatsappWorker = new Proxy({} as Worker<WhatsAppJobData>, {
  get(_t, prop, receiver) {
    if (!_worker) _worker = createWorker();
    const value = Reflect.get(_worker, prop, receiver);
    return typeof value === "function" ? value.bind(_worker) : value;
  },
});

export async function startWhatsAppWorker(): Promise<void> {
  if (process.env.VITEST) return;
  if (!_worker) _worker = createWorker();
  logger.info('WhatsApp worker started');
}

export async function stopWhatsAppWorker(): Promise<void> {
  if (_worker) {
    await _worker.close();
    _worker = null;
    logger.info('WhatsApp worker stopped');
  }
}
