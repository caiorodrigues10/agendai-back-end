import { inject, injectable } from "tsyringe";
import { IQueueRepository } from "../../repositories/IQueueRepository";
import { IQueueItemResponseDTO } from "../../dtos/IQueueItemResponseDTO";

@injectable()
export class ListQueueUseCase {
  constructor(
    @inject("QueueRepository")
    private queueRepository: IQueueRepository
  ) {}
  async execute(barbershopId?: string): Promise<IQueueItemResponseDTO[]> {
    return this.queueRepository.list(barbershopId);
  }
}
