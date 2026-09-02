import { Queue, QueueEvents } from "bullmq";
import { getRedisConnection } from "./redisConnection";
import type { EmailTemplateId } from "@/shared/container/providers/EmailProvider/IEmailProvider";
import { getModuleLogger } from "@/shared/utils/logger";
import {
  getNotificationV2Mode,
  scheduleNotification,
} from "@/modules/notifications/services/notificationDeliveryService";
import type { NotificationType } from "@/modules/notifications/services/notificationRegistry";

export type EmailJobData =
  | {
      kind: "forgot_password";
      email: string;
      token: string;
      deduplicationKey?: string;
    }
  | {
      kind: "welcome";
      ownerName: string;
      barbershopName: string;
      email: string;
      deduplicationKey?: string;
    }
  | {
      kind: "referral_applied";
      ownerName: string;
      email: string;
      referrerShopName: string;
      deduplicationKey?: string;
    }
  | {
      kind: "referral_converted";
      referrerName: string;
      referrerEmail: string;
      refereeShopName: string;
      rewardDays: number;
      deduplicationKey?: string;
    }
  | {
      kind: "verify_email";
      ownerName: string;
      email: string;
      token: string;
      deduplicationKey?: string;
    }
  | {
      kind: "referral_revoked";
      referrerName: string;
      referrerEmail: string;
      refereeShopName: string;
      revokedDays: number;
      deduplicationKey?: string;
    };

const QUEUE_NAME = "email";
const logger = getModuleLogger("queue:email");

let _queue: Queue<EmailJobData> | null = null;
let _events: QueueEvents | null = null;

function getQueue(): Queue<EmailJobData> {
  if (!_queue) {
    _queue = new Queue<EmailJobData>(QUEUE_NAME, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: { age: 3600 },
        removeOnFail: { age: 86400 },
      },
    });
  }
  return _queue;
}

function getEvents(): QueueEvents {
  if (!_events) {
    _events = new QueueEvents(QUEUE_NAME, {
      connection: getRedisConnection(),
    });
  }
  return _events;
}

export const emailQueue = new Proxy({} as Queue<EmailJobData>, {
  get(_t, prop, receiver) {
    const q = getQueue();
    const value = Reflect.get(q, prop, receiver);
    return typeof value === "function" ? value.bind(q) : value;
  },
});

export const emailQueueEvents = new Proxy({} as QueueEvents, {
  get(_t, prop, receiver) {
    const e = getEvents();
    const value = Reflect.get(e, prop, receiver);
    return typeof value === "function" ? value.bind(e) : value;
  },
});

function emailDestination(data: EmailJobData): string {
  return "email" in data ? data.email : data.referrerEmail;
}

function emailNotificationType(kind: EmailJobData["kind"]): NotificationType {
  switch (kind) {
    case "verify_email": return "AUTH_VERIFY_EMAIL";
    case "welcome": return "AUTH_WELCOME";
    case "forgot_password": return "AUTH_FORGOT_PASSWORD";
    case "referral_applied": return "REFERRAL_APPLIED";
    case "referral_converted": return "REFERRAL_CONVERTED";
    case "referral_revoked": return "REFERRAL_REVOKED";
  }
}

async function persistV2(data: EmailJobData): Promise<void> {
  const destination = emailDestination(data);
  await scheduleNotification({
    channel: "EMAIL",
    type: emailNotificationType(data.kind),
    destination,
    contentForHash: JSON.stringify({ ...data, email: undefined, referrerEmail: undefined, token: undefined }),
    payload: {
      channel: "EMAIL",
      destination,
      email: data as unknown as Record<string, unknown>,
    },
    idempotencyKey: data.deduplicationKey ?? `${data.kind}:${Date.now()}`,
    templateKey: data.kind,
  });
}

async function enqueueLegacy(data: EmailJobData): Promise<void> {
  if (process.env.VITEST) return;
  const { ensureEmailWorker } = await import("./emailWorker");
  await ensureEmailWorker();
  await getQueue().add(data.kind as EmailTemplateId, data, {
    jobId: data.deduplicationKey || undefined,
  });
}

export async function enqueueEmail(data: EmailJobData): Promise<void> {
  if (process.env.VITEST) return;
  const mode = getNotificationV2Mode();
  if (mode === "disabled") return enqueueLegacy(data);
  if (mode === "shadow") {
    await persistV2(data).catch((error) => {
      logger.warn({ err: error }, "Falha ao persistir e-mail no ledger sombra");
    });
    return enqueueLegacy(data);
  }
  await persistV2(data);
}
