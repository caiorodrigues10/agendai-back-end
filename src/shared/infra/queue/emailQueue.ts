import { Queue, QueueEvents } from "bullmq";
import { getRedisConnection } from "./redisConnection";
import type { EmailTemplateId } from "@/shared/container/providers/EmailProvider/IEmailProvider";
import { getModuleLogger } from "@/shared/utils/logger";
import {
  getNotificationV2Mode,
  scheduleNotification,
} from "@/modules/notifications/services/notificationDeliveryService";
import { canReceiveEmail } from "@/modules/email/services/emailPreferenceService";
import { prisma } from "@/libs/prismaClient";
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
      kind: "welcome_staff";
      staffName: string;
      barbershopName: string;
      email: string;
      inviteUrl: string;
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
      kind: "password_changed";
      ownerName: string;
      email: string;
      deduplicationKey?: string;
    }
  | {
      kind: "referral_revoked";
      referrerName: string;
      referrerEmail: string;
      refereeShopName: string;
      revokedDays: number;
      deduplicationKey?: string;
    }
  | {
      kind: "payment_approved";
      ownerName: string;
      email: string;
      planName: string;
      amount: number;
      nextBillingDate?: Date | string | null;
      deduplicationKey?: string;
    }
  | {
      kind: "payment_failed";
      ownerName: string;
      email: string;
      planName: string;
      reason?: string | null;
      retryUrl?: string;
      deduplicationKey?: string;
    }
  | {
      kind: "subscription_trial_ending";
      ownerName: string;
      email: string;
      planName: string;
      amount: number;
      daysLeft: number;
      deduplicationKey?: string;
    }
  | {
      kind: "subscription_renewal_failed";
      ownerName: string;
      email: string;
      planName: string;
      reason?: string | null;
      retryUrl?: string;
      deduplicationKey?: string;
    }
  | {
      kind: "subscription_canceled";
      ownerName: string;
      email: string;
      planName: string;
      endDate?: Date | string | null;
      deduplicationKey?: string;
    }
  | {
      kind: "subscription_renewed";
      ownerName: string;
      email: string;
      planName: string;
      amount: number;
      nextBillingDate?: Date | string | null;
      deduplicationKey?: string;
    }
  | {
      kind: "subscription_trial_ended";
      ownerName: string;
      email: string;
      planName: string;
      amount: number;
      graceDays: number;
      deduplicationKey?: string;
    }
  | {
      kind: "daily_digest";
      ownerName: string;
      email: string;
      barbershopName: string;
      date: string;
      appointments: Array<{
        time: string;
        clientName: string;
        serviceName: string;
        price?: number | null;
        staffName?: string | null;
        notes?: string | null;
      }>;
      totalScheduled: number;
      cancelledToday: number;
      nextAvailableSlot?: string | null;
      deduplicationKey?: string;
    }
  | {
      kind: "appointment_urgent_cancelled";
      ownerName: string;
      email: string;
      cancelledBy: "CLIENTE" | "SALAO";
      clientName?: string;
      serviceName?: string;
      originalTime: string;
      deduplicationKey?: string;
    }
  | {
      kind: "appointment_urgent_rescheduled";
      ownerName: string;
      email: string;
      originalTime: string;
      newTime: string;
      clientName?: string;
      serviceName?: string;
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
    case "welcome_staff": return "AUTH_WELCOME_STAFF";
    case "forgot_password": return "AUTH_FORGOT_PASSWORD";
    case "password_changed": return "AUTH_PASSWORD_CHANGED";
    case "referral_applied": return "REFERRAL_APPLIED";
    case "referral_converted": return "REFERRAL_CONVERTED";
    case "referral_revoked": return "REFERRAL_REVOKED";
    case "payment_approved": return "SUBSCRIPTION_PAYMENT_APPROVED";
    case "payment_failed": return "SUBSCRIPTION_PAYMENT_FAILED";
    case "subscription_renewed": return "SUBSCRIPTION_RENEWED";
    case "subscription_renewal_failed": return "SUBSCRIPTION_RENEWAL_FAILED";
    case "subscription_canceled": return "SUBSCRIPTION_CANCELED";
    case "subscription_trial_ended": return "SUBSCRIPTION_TRIAL_ENDED";
    case "subscription_trial_ending": return "SUBSCRIPTION_TRIAL_ENDING";
    case "daily_digest": return "DAILY_DIGEST";
    case "appointment_urgent_cancelled": return "APPOINTMENT_URGENT_CANCELLED";
    case "appointment_urgent_rescheduled": return "APPOINTMENT_URGENT_RESCHEDULED";
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

// ─── Checagem de preferência antes de prosseguir ────────────────

/**
 * Verifica se o usuário deve receber este e-mail.
 * Se a categoria não permitir (ex.: usuário desativou operation/marketing),
 * a mensagem é descartada silenciosamente antes de entrar na fila.
 */
async function shouldSendEmail(data: EmailJobData): Promise<boolean> {
  const kind = data.kind as string;

  // ESSENTIAL — nunca bloquear (auth, pagamentos, senha)
  if (
    [
      "verify_email",
      "welcome",
      "welcome_staff",
      "forgot_password",
      "password_changed",
      "payment_approved",
      "payment_failed",
      "subscription_renewal_failed",
      "subscription_canceled",
      "subscription_trial_ended",
    ].includes(kind)
  ) {
    return true;
  }

  // OPERATION e MARKETING — checa preferência por categoria.
  // Para e-mails de salão, o usuário é identificado pelo e-mail.
  const email = "email" in data ? data.email : undefined;
  if (!email) return true;

  // localiza usuário ativo associado a esse e-mail em algum salão
  const user = await prisma.user.findFirst({
    where: { email, active: true, deletedAt: null },
    select: { id: true, barbershopId: true },
  });
  if (!user) return true; // sem usuário registrado — não impede

  const category = kind === "daily_digest" || kind.startsWith("appointment_urgent")
    ? "OPERATION" as const
    : kind === "subscription_trial_ending" || kind === "subscription_renewed"
      ? "OPERATION" as const
      : "MARKETING" as const;

  return canReceiveEmail(user.id, user.barbershopId!, category);
}

async function enqueueLegacy(data: EmailJobData): Promise<void> {
  if (process.env.VITEST) return;

  if (!(await shouldSendEmail(data))) {
    logger.debug({ kind: data.kind }, "E-mail descartado por preferência do usuário");
    return;
  }

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

  if (!(await shouldSendEmail(data))) {
    logger.debug({ kind: data.kind }, "E-mail descartado por preferência no V2");
    return;
  }

  await persistV2(data);
}
