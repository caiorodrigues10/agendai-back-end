import { AppError } from "@/shared/errors/AppError";
import {
  IAdminWhatsAppQueueGateway,
  WhatsAppQueueName,
  WHATSAPP_QUEUE_NAMES,
} from "../../repositories/AdminWhatsAppQueueGateway";
import { IAdminWhatsAppAuditRepository } from "../../repositories/AdminWhatsAppAuditRepository";

export interface CleanWhatsAppJobInput {
  queue: string;
  jobId: string;
  reason: string;
  userId: string;
  ipAddress?: string;
}

const CLEANABLE_STATES = ["failed", "completed"];

export class CleanWhatsAppJobUseCase {
  constructor(
    private readonly queueGateway: IAdminWhatsAppQueueGateway,
    private readonly auditRepo: IAdminWhatsAppAuditRepository
  ) {}

  async execute(input: CleanWhatsAppJobInput) {
    if (!WHATSAPP_QUEUE_NAMES.includes(input.queue as WhatsAppQueueName)) {
      throw new AppError("Fila inválida", 400);
    }
    const queue = input.queue as WhatsAppQueueName;
    if (!input.jobId) throw new AppError("jobId obrigatório", 400);

    const state = await this.queueGateway.getJobState(queue, input.jobId);
    if (state === null) throw new AppError("Job não encontrado", 404);
    if (!CLEANABLE_STATES.includes(state)) {
      throw new AppError(`Job não pode ser removido no estado atual: ${state}`, 409);
    }

    await this.queueGateway.remove(queue, input.jobId);

    await this.auditRepo.create({
      userId: input.userId,
      action: "WHATSAPP_QUEUE_CLEAN",
      resource: "QueueJob",
      resourceId: input.jobId,
      details: { reason: input.reason, queue },
      ipAddress: input.ipAddress,
    });

    return { queue, jobId: input.jobId, removed: true };
  }
}
