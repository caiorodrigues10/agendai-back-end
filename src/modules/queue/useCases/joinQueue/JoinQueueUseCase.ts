import { inject, injectable } from "tsyringe";
import { randomUUID } from "node:crypto";
import { IQueueRepository } from "../../repositories/IQueueRepository";
import { IJoinQueueDTO } from "../../dtos/IJoinQueueDTO";
import { IQueueItemResponseDTO } from "../../dtos/IQueueItemResponseDTO";
import { AppError } from "@/shared/errors/AppError";
import { assertPublicShopOperationalAccess } from "@/shared/utils/assertPublicShopOperationalAccess";
import { prisma } from "@/libs/prismaClient";

@injectable()
export class JoinQueueUseCase {
  constructor(
    @inject("QueueRepository")
    private queueRepository: IQueueRepository
  ) {}

  async execute(data: IJoinQueueDTO): Promise<IQueueItemResponseDTO> {
    await assertPublicShopOperationalAccess(data.barbershopId);

    const service = await prisma.service.findFirst({
      where: {
        id: data.serviceId,
        barbershopId: data.barbershopId,
        active: true,
      },
      select: { id: true },
    });
    if (!service) {
      throw new AppError("Serviço inválido para este estabelecimento", 400);
    }

    const whatsappDigits = data.whatsapp.replace(/\D/g, "");
    const customerId = data.customerId ?? randomUUID();
    const duplicate = await this.queueRepository.findActiveDuplicate(
      data.barbershopId,
      customerId,
      whatsappDigits
    );
    if (duplicate) {
      throw new AppError("Você já está na fila", 409);
    }

    return this.queueRepository.create({
      ...data,
      customerId,
      addedByStaff: data.addedByStaff ?? false,
    });
  }
}
