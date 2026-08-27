/**
 * Worker BullMQ para broadcast de posts via WhatsApp.
 * Lazy com auto-stop — sobe quando há jobs, para após 60s ocioso.
 */
import { Worker, Job } from "bullmq";
import { getRedisConnection } from "./redisConnection";
import { PostBroadcastJobData } from "./postBroadcastQueue";
import { sendWhatsAppMedia } from "@/shared/services/evolutionApiService";
import { getModuleLogger } from "@/shared/utils/logger";

const logger = getModuleLogger("queue:postBroadcast");

const QUEUE_NAME = "post-broadcast";
const IDLE_TIMEOUT_MS = 60_000;

let _worker: Worker<PostBroadcastJobData> | null = null;
let _idleTimer: ReturnType<typeof setTimeout> | null = null;

function resetIdleTimer(): void {
  if (_idleTimer) clearTimeout(_idleTimer);
  _idleTimer = setTimeout(() => {
    stopPostBroadcastWorker();
  }, IDLE_TIMEOUT_MS);
}

function createWorker(): Worker<PostBroadcastJobData> {
  const worker = new Worker<PostBroadcastJobData>(
    QUEUE_NAME,
    async (job: Job<PostBroadcastJobData>) => {
      if (_idleTimer) clearTimeout(_idleTimer);

      const { clientPhone, imageBase64, caption, instanceName } = job.data;

      logger.debug(
        {
          jobId: job.id,
          postId: job.data.postId,
          attempt: job.attemptsMade + 1,
          maxAttempts: job.opts.attempts,
        },
        "Processing post broadcast job"
      );

      const sent = await sendWhatsAppMedia(
        clientPhone,
        imageBase64,
        caption,
        { instanceName: instanceName || undefined }
      );

      if (!sent) {
        throw new Error("Falha ao enviar mídia via WhatsApp");
      }

      resetIdleTimer();
      return { sent: true };
    },
    {
      connection: getRedisConnection(),
      concurrency: 1,
      limiter: { max: 1, duration: 3000 },
    }
  );

  worker.on("failed", (job, err) => {
    logger.error({ err, jobId: job?.id }, "Post broadcast job failed");
    resetIdleTimer();
  });

  worker.on("error", (err) => {
    logger.error({ err }, "Post broadcast worker error");
  });

  worker.on("ready", () => {
    resetIdleTimer();
  });

  return worker;
}

export const postBroadcastWorker = new Proxy(
  {} as Worker<PostBroadcastJobData>,
  {
    get(_t, prop, receiver) {
      if (!_worker) _worker = createWorker();
      const value = Reflect.get(_worker, prop, receiver);
      return typeof value === "function" ? value.bind(_worker) : value;
    },
  }
);

/** Ensure worker is running — chamado pelo enqueue. */
export async function ensurePostBroadcastWorker(): Promise<void> {
  if (process.env.VITEST) return;
  if (!_worker) {
    _worker = createWorker();
    logger.info("Post broadcast worker started (on-demand)");
  }
  if (_idleTimer) clearTimeout(_idleTimer);
}

export async function startPostBroadcastWorker(): Promise<void> {
  if (process.env.VITEST) return;
  if (!_worker) _worker = createWorker();
  logger.info("Post broadcast worker started");
}

export async function stopPostBroadcastWorker(): Promise<void> {
  if (_idleTimer) {
    clearTimeout(_idleTimer);
    _idleTimer = null;
  }
  if (_worker) {
    await _worker.close();
    _worker = null;
    logger.info("Post broadcast worker stopped (idle)");
  }
}
