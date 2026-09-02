/**
 * Fila BullMQ para envio de WhatsApp via Evolution API.
 * Instanciação lazy — em VITEST, enqueue é no-op (sem Redis).
 */
import { Queue, QueueEvents } from "bullmq";
import { getRedisConnection } from "./redisConnection";
import { getModuleLogger } from "@/shared/utils/logger";
import {
  getNotificationV2Mode,
  scheduleNotification,
} from "@/modules/notifications/services/notificationDeliveryService";
import type { NotificationType } from "@/modules/notifications/services/notificationRegistry";

export interface WhatsAppJobData {
  phone: string;
  message: string;
  instanceName?: string;
  /** Mensagem da plataforma (contato/indicação) — pode usar instância global da env. */
  platform?: boolean;
  /** Chave de deduplicação (ex: "join:barbershopId:queueItemId") */
  deduplicationKey?: string;
  /** Destinatário de campanha CRM; permite auditar êxito/falha no worker. */
  campaignRecipientId?: string;
  notificationType?: NotificationType;
  barbershopId?: string;
  clientId?: string;
  sourceType?: string;
  sourceId?: string;
}

const QUEUE_NAME = "whatsapp";
const logger = getModuleLogger("queue:whatsapp");

let _queue: Queue<WhatsAppJobData> | null = null;
let _events: QueueEvents | null = null;

function getQueue(): Queue<WhatsAppJobData> {
  if (!_queue) {
    _queue = new Queue<WhatsAppJobData>(QUEUE_NAME, {
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

/** Lazy — só cria fila ao acessar fora de testes. */
export const whatsappQueue = new Proxy({} as Queue<WhatsAppJobData>, {
  get(_t, prop, receiver) {
    const q = getQueue();
    const value = Reflect.get(q, prop, receiver);
    return typeof value === "function" ? value.bind(q) : value;
  },
});

export const whatsappQueueEvents = new Proxy({} as QueueEvents, {
  get(_t, prop, receiver) {
    const e = getEvents();
    const value = Reflect.get(e, prop, receiver);
    return typeof value === "function" ? value.bind(e) : value;
  },
});

function inferNotificationType(data: WhatsAppJobData): NotificationType {
  if (data.notificationType) return data.notificationType;
  const key = data.deduplicationKey ?? "";
  if (key.startsWith("crm-campaign:")) return "CRM_CAMPAIGN";
  if (key.startsWith("reminder-queue:")) return "APPOINTMENT_QUEUE_UPDATE";
  if (key.startsWith("reminder:")) return "APPOINTMENT_REMINDER";
  if (key.startsWith("position:")) return "QUEUE_POSITION";
  if (key.startsWith("call:")) return "QUEUE_CALLED";
  if (key.startsWith("cancel:")) return "QUEUE_CANCELED";
  if (key.startsWith("join:")) return "QUEUE_JOINED_SHOP_ALERT";
  if (key.startsWith("contact:")) return "CONTACT_ALERT";
  return "MANUAL";
}

async function persistV2(data: WhatsAppJobData) {
  const type = inferNotificationType(data);
  return scheduleNotification({
    channel: "WHATSAPP",
    type,
    destination: data.phone,
    contentForHash: data.message,
    payload: {
      channel: "WHATSAPP",
      destination: data.phone,
      whatsapp: {
        message: data.message,
        instanceName: data.instanceName,
        platform: data.platform,
      },
    },
    idempotencyKey:
      data.deduplicationKey ??
      `manual:${Date.now()}:${Math.random().toString(36).slice(2)}`,
    barbershopId: data.barbershopId ?? null,
    clientId: data.clientId ?? null,
    campaignRecipientId: data.campaignRecipientId ?? null,
    sourceType: data.sourceType ?? null,
    sourceId: data.sourceId ?? null,
  });
}

async function enqueueLegacy(data: WhatsAppJobData): Promise<void> {
  if (process.env.VITEST) return;
  if (!data.platform && !data.instanceName?.trim()) return;
  const { ensureWhatsAppWorker } = await import("./whatsappWorker");
  await ensureWhatsAppWorker();
  const jobId = data.deduplicationKey || undefined;
  await getQueue().add("send", data, { jobId });
}

export async function enqueueWhatsApp(data: WhatsAppJobData): Promise<{
  deliveryId?: string;
  status?: string;
} | void> {
  if (process.env.VITEST) return;
  const mode = getNotificationV2Mode();
  if (mode === "disabled") return enqueueLegacy(data);
  if (mode === "shadow") {
    await persistV2(data).catch((error) => {
      logger.warn({ err: error }, "Falha ao persistir notificação no ledger sombra");
    });
    return enqueueLegacy(data);
  }
  const delivery = await persistV2(data);
  return { deliveryId: delivery.id, status: delivery.status };
}
