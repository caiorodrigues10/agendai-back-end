import { IJoinQueueDTO } from "../dtos/IJoinQueueDTO";
import { IQueueItemResponseDTO } from "../dtos/IQueueItemResponseDTO";

export interface IQueueRepository {
  create(data: IJoinQueueDTO): Promise<IQueueItemResponseDTO>;
  assignClient(id: string, clientId: string): Promise<void>;
  findActiveDuplicate(
    barbershopId: string,
    customerId: string,
    whatsappDigits: string,
    customerName: string
  ): Promise<IQueueItemResponseDTO | null>;
  list(
    barbershopId?: string,
    options?: { statuses?: readonly ("WAITING" | "IN_CHAIR" | "COMPLETED" | "CANCELLED")[] }
  ): Promise<IQueueItemResponseDTO[]>;
  findById(id: string): Promise<IQueueItemResponseDTO | null>;
  updateStatus(
    id: string,
    status: string,
    details?: { completedBy?: string; finalPrice?: number; paymentMethod?: string; joinedAt?: Date }
  ): Promise<IQueueItemResponseDTO>;
  /**
   * Conclusão atômica: guard de transição (só IN_CHAIR → COMPLETED),
   * comissões (dedupe natural pela unique do par), ledger SERVICE_SALE e
   * fiado — tudo na mesma transação. Qualquer falha reverte a conclusão.
   * Lanca Error("QUEUE_ITEM_ALREADY_COMPLETED") quando a guarda recusa.
   */
  completeWithCommissions(
    id: string,
    details: {
      completedBy?: string;
      finalPrice: number;
      paymentMethod?: string;
      splits: Array<{ professionalId: string; percentage: number }>;
      /** Presente só quando o pagamento é fiado: o título nasce na MESMA transação. */
      fiado?: {
        customerName: string;
        whatsapp: string;
        clientId: string | null;
        description: string;
        createdById: string;
      } | null;
    },
  ): Promise<{ item: IQueueItemResponseDTO; createdFiadoId: string | null }>;
  /**
   * Arquivamento lógico ("remover da visualização"): o item sai das listas
   * operacionais, mas comissões/ledger permanecem ancorados nele.
   */
  archive(id: string, details: { archivedBy: string; reason?: string | null }): Promise<void>;
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
