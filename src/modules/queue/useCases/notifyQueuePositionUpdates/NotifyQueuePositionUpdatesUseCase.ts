import { inject, injectable } from "tsyringe";
import { IQueueRepository } from "@/modules/queue/repositories/IQueueRepository";
import { IBarbershopRepository } from "@/modules/barbershops/repositories/IBarbershopRepository";
import { sendWhatsAppMessage } from "@/shared/services/whatsappNotificationService";

export interface NotifyQueuePositionResult {
  notified: number;
  failed: number;
}

/**
 * Percorre toda a fila WAITING de uma barbearia (ordem joinedAt ASC) e, para
 * cada item cuja posição mudou desde a última notificação (campo
 * `lastNotifiedPosition`), envia uma mensagem de WhatsApp atualizando a posição
 * do cliente. Após o envio bem-sucedido, grava a nova posição em
 * `lastNotifiedPosition`.
 *
 * Mensagem para posição 1 ("chegou a vez"):
 *   Chegou sua vez, {customerName}! 🎉
 *   Você é o próximo a ser atendido na *{barbershopName}*.
 *   Pode se aproximar do balcão/recepção.
 *   Até já! 💈
 *
 * Mensagem para posição > 1 ("atualização"):
 *   📋 Atualização de fila, {customerName}!
 *   Você agora está na posição *{posicao}ª* da fila em *{barbershopName}*.
 *   ⏱️ Tempo médio estimado até seu atendimento: {tempoEstimado} min
 *   Assim que estiver perto, avisamos de novo!
 */
@injectable()
export class NotifyQueuePositionUpdatesUseCase {
  constructor(
    @inject("QueueRepository")
    private queueRepository: IQueueRepository,
    @inject("BarbershopRepository")
    private barbershopRepository: IBarbershopRepository
  ) {}

  async execute(barbershopId: string): Promise<NotifyQueuePositionResult> {
    const waiting = await this.queueRepository.findWaitingByBarbershop(barbershopId);
    if (waiting.length === 0) return { notified: 0, failed: 0 };

    const shop = await this.barbershopRepository.findById(barbershopId);
    const shopLabel = shop?.name?.trim() || "a barbearia";
    // Usa a instância da Evolution API configurada pela barbearia, se houver.
    // Fallback para a env var global é feito dentro de `sendWhatsAppMessage`.
    const instanceName = shop?.evolutionInstanceName?.trim() || undefined;

    let notified = 0;
    let failed = 0;

    for (let i = 0; i < waiting.length; i++) {
      const item = waiting[i];
      const position = i + 1;
      const lastNotified = item.lastNotifiedPosition ?? null;

      if (lastNotified === position) continue;

      const estimatedWaitMinutes = this.calcEstimatedWaitAhead(waiting, i);

      const message =
        position === 1
          ? this.buildYouAreNextMessage(item.customerName, shopLabel)
          : this.buildPositionUpdateMessage(
              item.customerName,
              shopLabel,
              position,
              estimatedWaitMinutes
            );

      const ok = await sendWhatsAppMessage(item.whatsapp, message, {
        instanceName,
      });
      if (ok) {
        await this.queueRepository.markNotifiedPosition(item.id, position);
        notified++;
      } else {
        failed++;
      }
    }

    return { notified, failed };
  }

  private calcEstimatedWaitAhead(
    waiting: { serviceAvgTimeMinutes?: number | null }[],
    currentIndex: number
  ): number {
    let total = 0;
    for (let j = 0; j < currentIndex; j++) {
      total += Number(waiting[j].serviceAvgTimeMinutes) || 0;
    }
    return total;
  }

  private buildYouAreNextMessage(customerName: string, shopLabel: string): string {
    return (
      `Chegou sua vez, ${customerName}! 🎉\n\n` +
      `Você é o próximo a ser atendido na *${shopLabel}*. ` +
      `Pode se aproximar do balcão/recepção.\n\nAté já! 💈`
    );
  }

  private buildPositionUpdateMessage(
    customerName: string,
    shopLabel: string,
    position: number,
    estimatedWaitMinutes: number
  ): string {
    return (
      `📋 Atualização de fila, ${customerName}!\n\n` +
      `Você agora está na posição *${position}ª* da fila em *${shopLabel}*.\n` +
      `⏱️ Tempo médio estimado até seu atendimento: ${estimatedWaitMinutes} min\n\n` +
      `Assim que estiver perto, avisamos de novo!`
    );
  }
}
