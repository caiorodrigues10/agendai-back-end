import { inject, injectable } from "tsyringe";
import { IQueueRepository } from "../../repositories/IQueueRepository";
import { NotifyQueuePositionUpdatesUseCase } from "../notifyQueuePositionUpdates/NotifyQueuePositionUpdatesUseCase";

@injectable()
export class DeleteQueueItemUseCase {
  constructor(
    @inject("QueueRepository")
    private queueRepository: IQueueRepository,
    @inject(NotifyQueuePositionUpdatesUseCase)
    private notifyQueuePositionUpdates: NotifyQueuePositionUpdatesUseCase
  ) {}
  async execute(id: string): Promise<void> {
    // Pega barbershopId antes de remover para poder avisar a fila daquela barbearia.
    const item = await this.queueRepository.findById(id);
    await this.queueRepository.delete(id);
    if (item) {
      try {
        await this.notifyQueuePositionUpdates.execute(item.barbershopId);
      } catch {
        // logar no futuro quando use case receber logger
      }
    }
  }
}
