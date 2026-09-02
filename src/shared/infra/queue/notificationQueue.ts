import { Queue } from "bullmq";
import { getRedisConnection } from "./redisConnection";

export interface NotificationJobData {
  deliveryId: string;
}

export const NOTIFICATION_QUEUE_NAME = "notifications-v2";

let queue: Queue<NotificationJobData> | null = null;

export function getNotificationQueue(): Queue<NotificationJobData> {
  if (!queue) {
    queue = new Queue<NotificationJobData>(NOTIFICATION_QUEUE_NAME, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5_000 },
        removeOnComplete: { age: 24 * 60 * 60 },
        removeOnFail: { age: 7 * 24 * 60 * 60 },
      },
    });
  }
  return queue;
}

export async function closeNotificationQueue(): Promise<void> {
  if (!queue) return;
  await queue.close();
  queue = null;
}
