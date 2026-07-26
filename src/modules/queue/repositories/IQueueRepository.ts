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
}
