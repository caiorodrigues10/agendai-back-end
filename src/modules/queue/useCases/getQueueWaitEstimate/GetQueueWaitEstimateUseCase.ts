import { inject, injectable } from "tsyringe";
import { IQueueRepository } from "@/modules/queue/repositories/IQueueRepository";
import { IQueueItemResponseDTO } from "@/modules/queue/dtos/IQueueItemResponseDTO";

export interface QueueWaitEstimate {
  /** Quantidade de pessoas à frente (em espera + em atendimento) */
  peopleAhead: number;
  /** Soma de service.avgTimeMinutes de cada item da frente, em minutos */
  estimatedWaitMinutes: number;
  /** Snapshot ordenado (joinedAt ASC) — útil para testes */
  items: Pick<IQueueItemResponseDTO, "id" | "customerName" | "serviceName" | "serviceAvgTimeMinutes" | "joinedAt">[];
}

/**
 * Estimativa de fila para mensagens de lembrete/agendamento.
 * Considera itens WAITING + IN_CHAIR (pessoas à frente), em ordem de chegada,
 * somando a duração média do serviço de cada um.
 */
@injectable()
export class GetQueueWaitEstimateUseCase {
  constructor(
    @inject("QueueRepository")
    private queueRepository: IQueueRepository
  ) {}

  async execute(barbershopId: string, referenceNow: number = Date.now()): Promise<QueueWaitEstimate> {
    const line = await this.queueRepository.findActiveInLine(barbershopId);

    const items = line.map((i) => ({
      id: i.id,
      customerName: i.customerName,
      serviceName: i.serviceName ?? null,
      serviceAvgTimeMinutes: i.serviceAvgTimeMinutes ?? null,
      joinedAt: i.joinedAt,
    }));

    const estimatedWaitMinutes = items.reduce<number>((acc, item) => {
      const t = Number(item.serviceAvgTimeMinutes) || 0;
      return acc + t;
    }, 0);

    const peopleAhead = items.length;

    // Referência mantida no retorno para testes de Math.max (sem classe Date de util)
    void referenceNow;

    return { peopleAhead, estimatedWaitMinutes, items };
  }
}
