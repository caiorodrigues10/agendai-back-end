import { inject, injectable } from "tsyringe";
import { IQueueRepository } from "../../repositories/IQueueRepository";

@injectable()
export class GetQueueMetricsUseCase {
  constructor(
    @inject("QueueRepository")
    private queueRepository: IQueueRepository
  ) {}

  async execute(barbershopId?: string): Promise<{ completedCount: number }> {
    const count = await this.queueRepository.countCompleted(barbershopId);
    return { completedCount: count };
  }
}
