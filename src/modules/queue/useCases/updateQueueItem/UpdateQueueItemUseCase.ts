import { inject, injectable } from "tsyringe";
import { AppError } from "@/shared/errors/AppError";
import { IQueueRepository } from "../../repositories/IQueueRepository";
import { NotifyQueuePositionUpdatesUseCase } from "../notifyQueuePositionUpdates/NotifyQueuePositionUpdatesUseCase";

@injectable()
export class UpdateQueueItemUseCase {
  constructor(
    @inject("QueueRepository")
    private queueRepository: IQueueRepository,
    @inject(NotifyQueuePositionUpdatesUseCase)
    private notifyQueuePositionUpdates: NotifyQueuePositionUpdatesUseCase
  ) {}
  async execute(id: string, status: string, details?: any) {
    const item = await this.queueRepository.findById(id);
    if (!item) throw new AppError("Item de fila não encontrado", 404);
    const updated = await this.queueRepository.updateStatus(id, status, details);
    // Atualiza posições de toda a fila em background, sem bloquear a resposta
    // do caller nem derrubar a operação em caso de falha de envio.
    try {
      await this.notifyQueuePositionUpdates.execute(item.barbershopId);
    } catch {
      // logar no futuro quando use case receber logger
    }
    return updated;
  }
}
