import type { Job } from "bullmq";
import { whatsappQueue } from "@/shared/infra/queue/whatsappQueue";
import { whatsappAiQueue } from "@/shared/infra/queue/whatsappAiQueue";
import { ownerBotQueue } from "@/shared/infra/queue/ownerBotQueue";

export const WHATSAPP_QUEUE_NAMES = ["whatsapp", "whatsapp-ai", "owner-bot"] as const;
export type WhatsAppQueueName = (typeof WHATSAPP_QUEUE_NAMES)[number];

export interface QueueUnavailable {
  available: false;
  error: string;
}

export interface QueueAvailableCounts {
  available: true;
  wait: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

export interface QueueAvailableJobs {
  available: true;
  jobs: AdminWhatsAppFailedJob[];
}

export type QueueCountsResult = QueueAvailableCounts | QueueUnavailable;
export type QueueJobsResult = QueueAvailableJobs | QueueUnavailable;

export interface AdminWhatsAppFailedJob {
  id: string | undefined;
  name: string;
  failedReason: string;
  attemptsMade: number;
  timestamp: number;
  phone: string | null;
}

/** Só o que o gateway precisa das filas — evita `any` e facilita o mock. */
export interface AdminWhatsAppQueueClient {
  getJobCounts(...types: string[]): Promise<Record<string, number>>;
  getFailed(start: number, end: number, asc?: boolean): Promise<Job[]>;
  getJob(jobId: string): Promise<Job | undefined>;
}

/**
 * Reusa as filas já instanciadas pelos módulos de fila (lazy singleton).
 * Nenhuma conexão nova é aberta por request.
 */
const QUEUE_CLIENTS: Record<WhatsAppQueueName, AdminWhatsAppQueueClient> = {
  whatsapp: whatsappQueue as unknown as AdminWhatsAppQueueClient,
  "whatsapp-ai": whatsappAiQueue as unknown as AdminWhatsAppQueueClient,
  "owner-bot": ownerBotQueue as unknown as AdminWhatsAppQueueClient,
};

export interface IAdminWhatsAppQueueGateway {
  counts(names: readonly WhatsAppQueueName[]): Promise<Record<string, QueueCountsResult>>;
  failedJobs(names: readonly WhatsAppQueueName[]): Promise<Record<string, QueueJobsResult>>;
  getJobState(queue: WhatsAppQueueName, jobId: string): Promise<string | null>;
  retry(queue: WhatsAppQueueName, jobId: string): Promise<void>;
  remove(queue: WhatsAppQueueName, jobId: string): Promise<void>;
}

const QUEUE_UNAVAILABLE_ERROR = "Fila indisponível";

function unavailableError(error: unknown): string {
  if (error instanceof Error && error.message) {
    // mensagem curta, sem stack e sem credenciais
    return error.message.slice(0, 120).replace(/apikey=\S+/gi, "apikey=***");
  }
  return QUEUE_UNAVAILABLE_ERROR;
}

export class AdminWhatsAppQueueGateway implements IAdminWhatsAppQueueGateway {
  private client(queue: WhatsAppQueueName): AdminWhatsAppQueueClient {
    return QUEUE_CLIENTS[queue];
  }

  async counts(
    names: readonly WhatsAppQueueName[]
  ): Promise<Record<string, QueueCountsResult>> {
    const output: Record<string, QueueCountsResult> = {};
    for (const name of names) {
      try {
        const counts = await this.client(name).getJobCounts(
          "wait",
          "active",
          "completed",
          "failed",
          "delayed"
        );
        output[name] = {
          available: true,
          wait: counts.wait ?? 0,
          active: counts.active ?? 0,
          completed: counts.completed ?? 0,
          failed: counts.failed ?? 0,
          delayed: counts.delayed ?? 0,
        };
      } catch (error) {
        output[name] = { available: false, error: unavailableError(error) };
      }
    }
    return output;
  }

  async failedJobs(
    names: readonly WhatsAppQueueName[]
  ): Promise<Record<string, QueueJobsResult>> {
    const output: Record<string, QueueJobsResult> = {};
    for (const name of names) {
      try {
        const failed = await this.client(name).getFailed(0, 20);
        output[name] = {
          available: true,
          jobs: failed.map((job) => {
            const data = (job.data ?? {}) as Record<string, unknown>;
            return {
              id: job.id,
              name: job.name,
              failedReason: (job.failedReason ?? "").slice(0, 300),
              attemptsMade: job.attemptsMade,
              timestamp: job.timestamp,
              phone: typeof data.phone === "string" ? data.phone : null,
            };
          }),
        };
      } catch (error) {
        output[name] = { available: false, error: unavailableError(error) };
      }
    }
    return output;
  }

  async getJobState(queue: WhatsAppQueueName, jobId: string): Promise<string | null> {
    const job = await this.client(queue).getJob(jobId);
    if (!job) return null;
    return job.getState();
  }

  async retry(queue: WhatsAppQueueName, jobId: string): Promise<void> {
    const job = await this.client(queue).getJob(jobId);
    if (!job) throw new Error("Job não encontrado");
    await job.retry();
  }

  async remove(queue: WhatsAppQueueName, jobId: string): Promise<void> {
    const job = await this.client(queue).getJob(jobId);
    if (job) await job.remove();
  }
}
