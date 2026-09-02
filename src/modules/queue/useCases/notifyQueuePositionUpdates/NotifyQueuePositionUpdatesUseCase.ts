import { inject, injectable } from "tsyringe";
import { IQueueRepository } from "@/modules/queue/repositories/IQueueRepository";
import { IBarbershopRepository } from "@/modules/barbershops/repositories/IBarbershopRepository";
import { enqueueWhatsApp } from "@/shared/infra/queue";
import { getModuleLogger } from "@/shared/utils/logger";
import { isPlaceholderWhatsApp } from "@/modules/queue/utils/queueDuplicate";

const logger = getModuleLogger('queue:notify');

/** Mensagem ao chamar o cliente (cadeira) — mesmo texto da posição 1. */
export function buildQueueCalledMessage(customerName: string, shopLabel: string): string {
  return (
    `Chegou sua vez, ${customerName}! 🎉\n\n` +
    `Você é o próximo a ser atendido na *${shopLabel}*. ` +
    `Pode se aproximar do balcão/recepção.\n\nAté já! 💈`
  );
}

/** Confirmação para o cliente ao entrar na fila (não é “chegou sua vez”). */
export function buildQueueJoinedMessage(
  customerName: string,
  shopLabel: string,
  position: number,
  estimatedWaitMinutes: number
): string {
  if (position <= 1) {
    return (
      `Olá ${customerName}! Você entrou na fila da *${shopLabel}* e é o próximo.\n\n` +
      `Aguarde ser chamado no salão — avisamos por aqui. 💈`
    );
  }
  return (
    `Olá ${customerName}! Você entrou na fila da *${shopLabel}*.\n\n` +
    `Posição: *${position}ª*\n` +
    `⏱️ Tempo médio estimado: ${estimatedWaitMinutes} min\n\n` +
    `Assim que chegar sua vez, avisamos por aqui. 💈`
  );
}

/** Aviso ao cliente quando o staff cancela o lugar na fila. */
export function buildQueueCancelledMessage(customerName: string, shopLabel: string): string {
  return (
    `Olá ${customerName}, seu lugar na fila da *${shopLabel}* foi cancelado.\n\n` +
    `Se quiser voltar, é só entrar de novo pelo link do salão.`
  );
}

/** Envia WhatsApp de entrada na fila e grava lastNotifiedPosition. */
export async function notifyCustomerJoinedQueue(
  item: {
    id: string;
    barbershopId: string;
    customerName: string;
    whatsapp: string;
    clientId?: string | null;
  },
  queueRepository: IQueueRepository,
  barbershopRepository: IBarbershopRepository
): Promise<void> {
  if (isPlaceholderWhatsApp(item.whatsapp)) return;

  const shop = await barbershopRepository.findById(item.barbershopId);
  const instanceName = shop?.evolutionInstanceName?.trim();
  if (!instanceName) return;

  const waiting = await queueRepository.findWaitingByBarbershop(item.barbershopId);
  const index = waiting.findIndex((w) => w.id === item.id);
  const position = index >= 0 ? index + 1 : Math.max(waiting.length, 1);
  let estimatedWaitMinutes = 0;
  const aheadUntil = index >= 0 ? index : waiting.length;
  for (let j = 0; j < aheadUntil; j++) {
    estimatedWaitMinutes += Number(waiting[j].serviceAvgTimeMinutes) || 0;
  }

  const shopLabel = shop?.name?.trim() || "a barbearia";
  await enqueueWhatsApp({
    phone: item.whatsapp,
    message: buildQueueJoinedMessage(
      item.customerName,
      shopLabel,
      position,
      estimatedWaitMinutes
    ),
    instanceName,
    deduplicationKey: `join-customer:${item.id}`,
    notificationType: "QUEUE_JOINED_CLIENT",
    barbershopId: item.barbershopId,
    clientId: item.clientId ?? undefined,
    sourceType: "QUEUE_ITEM",
    sourceId: item.id,
  });
  await queueRepository.markNotifiedPosition(item.id, position);
}

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
    const instanceName = shop?.evolutionInstanceName?.trim();
    if (!instanceName) return { notified: 0, failed: 0 };

    let notified = 0;
    let failed = 0;

    for (let i = 0; i < waiting.length; i++) {
      const item = waiting[i];
      const position = i + 1;
      const lastNotified = item.lastNotifiedPosition ?? null;

      if (lastNotified === position) continue;

      if (isPlaceholderWhatsApp(item.whatsapp)) {
        await this.queueRepository.markNotifiedPosition(item.id, position);
        continue;
      }

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

      const ok = await enqueueWhatsApp({
        phone: item.whatsapp,
        message,
        instanceName,
        deduplicationKey: `position:${barbershopId}:${item.id}:${position}`,
        notificationType: position === 1 ? "QUEUE_CALLED" : "QUEUE_POSITION",
        barbershopId,
        clientId: item.clientId ?? undefined,
        sourceType: "QUEUE_ITEM",
        sourceId: item.id,
      }).then(() => true).catch((err) => { logger.error({ err }, 'Failed to enqueue WhatsApp position update'); return false; });
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
    return buildQueueCalledMessage(customerName, shopLabel);
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
