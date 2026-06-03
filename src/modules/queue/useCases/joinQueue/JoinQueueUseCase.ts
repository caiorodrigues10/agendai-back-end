import { inject, injectable } from "tsyringe";
import { IQueueRepository } from "../../repositories/IQueueRepository";
import { IJoinQueueDTO } from "../../dtos/IJoinQueueDTO";
import { IQueueItemResponseDTO } from "../../dtos/IQueueItemResponseDTO";

@injectable()
export class JoinQueueUseCase {
  constructor(
    @inject("QueueRepository")
    private queueRepository: IQueueRepository
  ) {}
  async execute(data: IJoinQueueDTO): Promise<IQueueItemResponseDTO> {
    return this.queueRepository.create(data);
  }
}
