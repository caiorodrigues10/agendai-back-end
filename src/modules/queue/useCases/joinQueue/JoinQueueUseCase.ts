import { inject, injectable } from "tsyringe";
import { IQueueRepository } from "../../repositories/IQueueRepository";
import { IJoinQueueDTO } from "../../dtos/IJoinQueueDTO";
import { IQueueItemResponseDTO } from "../../dtos/IQueueItemResponseDTO";
import { AppError } from "@/shared/errors/AppError";

@injectable()
export class JoinQueueUseCase {
  constructor(
    @inject("QueueRepository")
    private queueRepository: IQueueRepository
  ) {}
  async execute(data: IJoinQueueDTO): Promise<IQueueItemResponseDTO> {
    const whatsappDigits = data.whatsapp.replace(/\D/g, "");
    const duplicate = await this.queueRepository.findActiveDuplicate(
      data.barbershopId,
      data.customerId,
      whatsappDigits
    );
    if (duplicate) {
      throw new AppError("Você já está na fila", 409);
    }
    return this.queueRepository.create(data);
  }
}
