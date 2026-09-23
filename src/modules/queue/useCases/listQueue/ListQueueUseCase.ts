import { inject, injectable } from "tsyringe";
import { IQueueRepository } from "../../repositories/IQueueRepository";
import { IQueueItemResponseDTO } from "../../dtos/IQueueItemResponseDTO";

@injectable()
export class ListQueueUseCase {
  constructor(
    @inject("QueueRepository")
    private queueRepository: IQueueRepository
  ) {}
  async execute(
    barbershopId?: string,
    options?: { statuses?: readonly ("WAITING" | "IN_CHAIR" | "COMPLETED" | "CANCELLED")[] }
  ): Promise<IQueueItemResponseDTO[]> {
    return this.queueRepository.list(barbershopId, options);
  }
}
