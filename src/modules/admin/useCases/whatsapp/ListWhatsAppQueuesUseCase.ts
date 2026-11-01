import { maskPhone } from "@/modules/whatsappOwnerBot/messages";
import {
  IAdminWhatsAppQueueGateway,
  WHATSAPP_QUEUE_NAMES,
} from "../../repositories/AdminWhatsAppQueueGateway";

export class ListWhatsAppQueuesUseCase {
  constructor(private readonly queueGateway: IAdminWhatsAppQueueGateway) {}

  async execute() {
    const [counts, failed] = await Promise.all([
      this.queueGateway.counts(WHATSAPP_QUEUE_NAMES),
      this.queueGateway.failedJobs(WHATSAPP_QUEUE_NAMES),
    ]);

    const failedDetails: Record<
      string,
      { available: boolean; error?: string; jobs?: Array<Record<string, unknown>> }
    > = {};
    for (const name of WHATSAPP_QUEUE_NAMES) {
      const queue = failed[name];
      if (!queue || !queue.available) {
        failedDetails[name] = {
          available: false,
          error: queue && !queue.available ? queue.error : "Fila indisponível",
        };
        continue;
      }
      failedDetails[name] = {
        available: true,
        jobs: queue.jobs.map((job) => ({
          id: job.id,
          name: job.name,
          failedReason: job.failedReason,
          attemptsMade: job.attemptsMade,
          timestamp: job.timestamp,
          phoneMasked: job.phone ? maskPhone(job.phone) : null,
        })),
      };
    }

    return { counts, failed: failedDetails };
  }
}
