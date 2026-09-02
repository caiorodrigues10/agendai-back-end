import { inject, injectable } from "tsyringe";
import { randomUUID } from "node:crypto";
import { IQueueRepository } from "../../repositories/IQueueRepository";
import { IBarbershopRepository } from "@/modules/barbershops/repositories/IBarbershopRepository";
import { IJoinQueueDTO } from "../../dtos/IJoinQueueDTO";
import { IQueueItemResponseDTO } from "../../dtos/IQueueItemResponseDTO";
import { AppError } from "@/shared/errors/AppError";
import { assertPublicShopOperationalAccess } from "@/shared/utils/assertPublicShopOperationalAccess";
import { prisma } from "@/libs/prismaClient";
import { notifyCustomerJoinedQueue } from "../notifyQueuePositionUpdates/NotifyQueuePositionUpdatesUseCase";
import { ISalonClientRepository } from "@/modules/clients/repositories/ISalonClientRepository";
import { computeIdentityKey } from "../../utils/identityKey";

@injectable()
export class JoinQueueUseCase {
  constructor(
    @inject("QueueRepository")
    private queueRepository: IQueueRepository,
    @inject("BarbershopRepository")
    private barbershopRepository: IBarbershopRepository,
    @inject("SalonClientRepository")
    private salonClients?: ISalonClientRepository
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
    const activeIdentityKey = computeIdentityKey(data.whatsapp, data.customerName, customerId);

    const existingByCustomer = await this.queueRepository.findActiveDuplicate(
      data.barbershopId,
      customerId,
      whatsappDigits,
      data.customerName
    );
    if (existingByCustomer) {
      throw new AppError("Você já está na fila", 409);
    }

    const existingByKey = await prisma.queueItem.findFirst({
      where: {
        barbershopId: data.barbershopId,
        activeIdentityKey,
        status: { in: ["WAITING", "IN_CHAIR"] },
      },
      select: { id: true },
    });
    if (existingByKey) {
      throw new AppError("Pessoa já está na fila", 409);
    }

    let item: IQueueItemResponseDTO;
    try {
      item = await this.queueRepository.create({
        ...data,
        customerId,
        activeIdentityKey,
        addedByStaff: data.addedByStaff ?? false,
      });
    } catch (error: unknown) {
      if (
        error instanceof Object &&
        "code" in error &&
        (error as { code: string }).code === "P2002"
      ) {
        throw new AppError("Pessoa já está na fila", 409);
      }
      throw error;
    }

    try {
      const client = await this.salonClients?.upsertFromVisit(
        item.barbershopId,
        item.customerName,
        item.whatsapp
      );
      if (client) await this.queueRepository.assignClient(item.id, client.id);
    } catch {
      // CRM não bloqueia entrada na fila
    }

    try {
      await notifyCustomerJoinedQueue(
        item,
        this.queueRepository,
        this.barbershopRepository
      );
    } catch {
      // notificação não bloqueia entrada na fila
    }

    return item;
  }
}
