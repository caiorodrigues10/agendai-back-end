import { inject, injectable } from "tsyringe";
import { IQueueRepository } from "../../repositories/IQueueRepository";

@injectable()
export class DeleteQueueItemUseCase {
  constructor(
    @inject("QueueRepository")
    private queueRepository: IQueueRepository
  ) {}
  async execute(id: string): Promise<void> {
    await this.queueRepository.delete(id);
  }
}
