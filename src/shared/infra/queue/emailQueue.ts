import { Queue, QueueEvents } from "bullmq";
import { getRedisConnection } from "./redisConnection";
import type { EmailTemplateId } from "@/shared/container/providers/EmailProvider/IEmailProvider";

export type EmailJobData =
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

export async function enqueueEmail(data: EmailJobData): Promise<void> {
  if (process.env.VITEST) return;
  await getQueue().add(data.kind as EmailTemplateId, data, {
    jobId: data.deduplicationKey || undefined,
  });
}
