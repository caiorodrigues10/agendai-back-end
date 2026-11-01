import { AppError } from "@/shared/errors/AppError";
import {
  IAdminWhatsAppQueueGateway,
  WhatsAppQueueName,
  WHATSAPP_QUEUE_NAMES,
} from "../../repositories/AdminWhatsAppQueueGateway";
import { IAdminWhatsAppAuditRepository } from "../../repositories/AdminWhatsAppAuditRepository";

export interface ManageWhatsAppJobInput {
  queue: string;
  jobId: string;
  reason: string;
  userId: string;
  ipAddress?: string;
}

function assertQueueName(queue: string): WhatsAppQueueName {
  if (!WHATSAPP_QUEUE_NAMES.includes(queue as WhatsAppQueueName)) {
    throw new AppError("Fila inválida", 400);
  }
  return queue as WhatsAppQueueName;
}

export class ReprocessWhatsAppJobUseCase {
  constructor(
    private readonly queueGateway: IAdminWhatsAppQueueGateway,
    private readonly auditRepo: IAdminWhatsAppAuditRepository
  ) {}

  async execute(input: ManageWhatsAppJobInput) {
    const queue = assertQueueName(input.queue);
    if (!input.jobId) throw new AppError("jobId obrigatório", 400);

    const state = await this.queueGateway.getJobState(queue, input.jobId);
    if (state === null) throw new AppError("Job não encontrado", 404);
    if (state !== "failed") {
      throw new AppError(`Job não está falho (estado atual: ${state})`, 409);
    }

    await this.queueGateway.retry(queue, input.jobId);

    await this.auditRepo.create({
      userId: input.userId,
      action: "WHATSAPP_QUEUE_REPROCESS",
      resource: "QueueJob",
      resourceId: input.jobId,
      details: { reason: input.reason, queue },
      ipAddress: input.ipAddress,
    });

    return { queue, jobId: input.jobId, reprocessed: true };
  }
}
