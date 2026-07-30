import { IJoinQueueDTO } from "../dtos/IJoinQueueDTO";
import { IQueueItemResponseDTO } from "../dtos/IQueueItemResponseDTO";

export interface IQueueRepository {
  create(data: IJoinQueueDTO): Promise<IQueueItemResponseDTO>;
  findActiveDuplicate(
    barbershopId: string,
    customerId: string,
    whatsappDigits: string
  ): Promise<IQueueItemResponseDTO | null>;
  list(barbershopId?: string): Promise<IQueueItemResponseDTO[]>;
  findById(id: string): Promise<IQueueItemResponseDTO | null>;
  updateStatus(id: string, status: string, details?: any): Promise<IQueueItemResponseDTO>;
  delete(id: string): Promise<void>;
  countCompleted(barbershopId?: string): Promise<number>;
  /**
   * Itens ainda em atendimento (WAITING | IN_CHAIR) de uma barbearia, em ordem
   * de chegada (joinedAt ASC). Inclui service.avgTimeMinutes (via serviceName).
   * Usado para estimar fila no lembrete de agendamento.
   */
  findActiveInLine(barbershopId: string): Promise<IQueueItemResponseDTO[]>;
  /**
   * Todos os itens WAITING da barbearia, ordenados por joinedAt ASC.
   * Usado pelo NotifyQueuePositionUpdatesUseCase para calcular posições e
   * disparar atualizações para todos cuja posição mudou.
   */
  findWaitingByBarbershop(barbershopId: string): Promise<IQueueItemResponseDTO[]>;
  /**
   * Grava a última posição notificada para o item (pós-envio bem-sucedido
   * da mensagem de atualização de posição).
   */
  markNotifiedPosition(id: string, position: number): Promise<void>;
}
