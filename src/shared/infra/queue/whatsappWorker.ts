/**
 * Worker BullMQ para envio de WhatsApp.
 * Lazy com auto-stop — sobe quando há jobs, para após 60s ocioso.
 */
import { Worker, Job } from "bullmq";
import { getRedisConnection } from "./redisConnection";
import { WhatsAppJobData } from "./whatsappQueue";
import { sendWhatsAppMessage } from "@/shared/services/evolutionApiService";
import { getModuleLogger } from "@/shared/utils/logger";
import { prisma } from "@/libs/prismaClient";
import { refreshCrmCampaignStatus } from "@/modules/crm/services/campaignStatusService";

const logger = getModuleLogger('queue:whatsapp');

const QUEUE_NAME = "whatsapp";
const IDLE_TIMEOUT_MS = 60_000;

let _worker: Worker<WhatsAppJobData> | null = null;
let _idleTimer: ReturnType<typeof setTimeout> | null = null;

function resetIdleTimer(): void {
  if (_idleTimer) clearTimeout(_idleTimer);
  _idleTimer = setTimeout(() => {
    stopWhatsAppWorker();
  }, IDLE_TIMEOUT_MS);
}

function createWorker(): Worker<WhatsAppJobData> {
  const worker = new Worker<WhatsAppJobData>(
    QUEUE_NAME,
    async (job: Job<WhatsAppJobData>) => {
      if (_idleTimer) clearTimeout(_idleTimer);

      const { phone, message, instanceName, platform, campaignRecipientId } = job.data;

      logger.debug({ jobId: job.id, attempt: job.attemptsMade + 1, maxAttempts: job.opts.attempts }, 'Processing WhatsApp job');

      const sent = await sendWhatsAppMessage(phone, message, {
        instanceName: instanceName || undefined,
        platform: Boolean(platform),
      });

      if (!sent) {
        throw new Error(`Falha ao enviar WhatsApp`);
      }
      if (campaignRecipientId) {
        const recipient = await prisma.crmCampaignRecipient.update({ where: { id: campaignRecipientId }, data: { status: "SENT", sentAt: new Date(), error: null }, select: { campaignId: true } });
        await refreshCrmCampaignStatus(recipient.campaignId);
      }

      resetIdleTimer();
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
    if (job?.data.campaignRecipientId) {
      prisma.crmCampaignRecipient.update({ where: { id: job.data.campaignRecipientId }, data: { status: "FAILED", error: err.message.slice(0, 2000) }, select: { campaignId: true } })
        .then((recipient: { campaignId: string }) => refreshCrmCampaignStatus(recipient.campaignId))
        .catch((updateErr: unknown) => logger.error({ err: updateErr }, "Falha ao registrar resultado da campanha"));
    }
    resetIdleTimer();
  });

  worker.on("error", (err) => {
    logger.error({ err }, 'WhatsApp worker error');
  });

  worker.on("ready", () => {
    resetIdleTimer();
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

/** Ensure worker is running — chamado pelo enqueue. */
export async function ensureWhatsAppWorker(): Promise<void> {
  if (process.env.VITEST) return;
  if (!_worker) {
    _worker = createWorker();
    logger.info('WhatsApp worker started (on-demand)');
  }
  if (_idleTimer) clearTimeout(_idleTimer);
}

export async function startWhatsAppWorker(): Promise<void> {
  if (process.env.VITEST) return;
  if (!_worker) _worker = createWorker();
  logger.info('WhatsApp worker started');
}

export async function stopWhatsAppWorker(): Promise<void> {
  if (_idleTimer) {
    clearTimeout(_idleTimer);
    _idleTimer = null;
  }
  if (_worker) {
    await _worker.close();
    _worker = null;
    logger.info('WhatsApp worker stopped (idle)');
  }
}
