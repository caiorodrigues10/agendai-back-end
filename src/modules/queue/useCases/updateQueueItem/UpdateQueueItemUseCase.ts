import { inject, injectable } from "tsyringe";
import { AppError } from "@/shared/errors/AppError";
import { IQueueRepository } from "../../repositories/IQueueRepository";
@injectable()
export class UpdateQueueItemUseCase {
  constructor(
    @inject("QueueRepository")
    private queueRepository: IQueueRepository
  ) {}
  async execute(id: string, status: string, details?: any) {
    const item = await this.queueRepository.findById(id);
    if (!item) throw new AppError("Item de fila não encontrado", 404);
    return this.queueRepository.updateStatus(id, status, details);
  }
}
