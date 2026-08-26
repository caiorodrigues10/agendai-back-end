import { Worker, Job } from "bullmq";
import { container } from "tsyringe";
import { getRedisConnection } from "./redisConnection";
import type { EmailJobData } from "./emailQueue";
import type { IEmailProvider } from "@/shared/container/providers/EmailProvider/IEmailProvider";
import { buildWelcomeEmail } from "@/modules/email/templates/welcomeEmail";
import {
  buildReferralAppliedEmail,
  buildReferralConvertedEmail,
  buildReferralRevokedEmail,
} from "@/modules/email/templates/referralEmails";
import { buildVerifyEmail } from "@/modules/email/templates/authEmails";
import { getModuleLogger } from "@/shared/utils/logger";

const logger = getModuleLogger('queue:email');

const QUEUE_NAME = "email";
const IDLE_TIMEOUT_MS = 60_000;

function buildEmailPayload(data: EmailJobData) {
  switch (data.kind) {
    case "welcome":
      return buildWelcomeEmail(data);
    case "referral_applied":
      return buildReferralAppliedEmail(data);
    case "referral_converted":
      return buildReferralConvertedEmail(data);
    case "verify_email":
      return buildVerifyEmail(data);
    case "referral_revoked":
      return buildReferralRevokedEmail(data);
    default: {
      const _exhaustive: never = data;
      throw new Error(
        `Unknown email kind: ${(_exhaustive as EmailJobData).kind}`
      );
    }
  }
}

let _worker: Worker<EmailJobData> | null = null;
let _idleTimer: ReturnType<typeof setTimeout> | null = null;

function resetIdleTimer(): void {
  if (_idleTimer) clearTimeout(_idleTimer);
  _idleTimer = setTimeout(() => {
    stopEmailWorker();
  }, IDLE_TIMEOUT_MS);
}

function createWorker(): Worker<EmailJobData> {
  const worker = new Worker<EmailJobData>(
    QUEUE_NAME,
    async (job: Job<EmailJobData>) => {
      if (_idleTimer) clearTimeout(_idleTimer);

      const emailProvider =
        container.resolve<IEmailProvider>("EmailProvider");
      const payload = buildEmailPayload(job.data);
      const result = await emailProvider.send(payload);
      if (!result.ok) {
        throw new Error(
          result.error || `Falha ao enviar e-mail ${job.data.kind}`
        );
      }

      resetIdleTimer();
      return result;
    },
    {
      connection: getRedisConnection(),
      concurrency: 5,
      limiter: { max: 10, duration: 1000 },
    }
  );

  worker.on("failed", (job, err) => {
    logger.error({ err, jobId: job?.id }, 'Email job failed');
    resetIdleTimer();
  });

  worker.on("ready", () => {
    resetIdleTimer();
  });

  return worker;
}

export const emailWorker = new Proxy({} as Worker<EmailJobData>, {
  get(_t, prop, receiver) {
    if (!_worker) _worker = createWorker();
    const value = Reflect.get(_worker, prop, receiver);
    return typeof value === "function" ? value.bind(_worker) : value;
  },
});

/** Ensure worker is running — chamado pelo enqueue. */
export async function ensureEmailWorker(): Promise<void> {
  if (process.env.VITEST) return;
  if (!_worker) {
    _worker = createWorker();
    logger.info('Email worker started (on-demand)');
  }
  if (_idleTimer) clearTimeout(_idleTimer);
}

export async function startEmailWorker(): Promise<void> {
  if (process.env.VITEST) return;
  if (!_worker) _worker = createWorker();
  logger.info('Email worker started');
}

export async function stopEmailWorker(): Promise<void> {
  if (_idleTimer) {
    clearTimeout(_idleTimer);
    _idleTimer = null;
  }
  if (_worker) {
    await _worker.close();
    _worker = null;
    logger.info('Email worker stopped (idle)');
  }
}
