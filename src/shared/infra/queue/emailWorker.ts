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

const QUEUE_NAME = "email";

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

function createWorker(): Worker<EmailJobData> {
  const worker = new Worker<EmailJobData>(
    QUEUE_NAME,
    async (job: Job<EmailJobData>) => {
      const emailProvider =
        container.resolve<IEmailProvider>("EmailProvider");
      const payload = buildEmailPayload(job.data);
      const result = await emailProvider.send(payload);
      if (!result.ok) {
        throw new Error(
          result.error || `Falha ao enviar e-mail ${job.data.kind}`
        );
      }
      return result;
    },
    {
      connection: getRedisConnection(),
      concurrency: 5,
      limiter: { max: 10, duration: 1000 },
    }
  );

  worker.on("failed", (job, err) => {
    console.error(`[Email Worker] Job ${job?.id} falhou:`, err.message);
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

export async function startEmailWorker(): Promise<void> {
  if (process.env.VITEST) return;
  if (!_worker) _worker = createWorker();
  console.log("[Email Worker] Iniciado");
}

export async function stopEmailWorker(): Promise<void> {
  if (_worker) {
    await _worker.close();
    _worker = null;
    console.log("[Email Worker] Parado");
  }
}
