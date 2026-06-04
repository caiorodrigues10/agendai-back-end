import { prisma } from "@/libs/prismaClient";
import { IJoinQueueDTO } from "../../dtos/IJoinQueueDTO";
import { IQueueItemResponseDTO } from "../../dtos/IQueueItemResponseDTO";
import { IQueueRepository } from "../../repositories/IQueueRepository";
import { QueueStatus } from "@prisma/client";

export class QueueRepository implements IQueueRepository {
  async create(data: IJoinQueueDTO): Promise<IQueueItemResponseDTO> {
    const queueItem = await prisma.queueItem.create({
      data: {
        barbershopId: data.barbershopId,
        serviceId: data.serviceId,
        customerId: data.customerId,
        customerName: data.customerName,
        whatsapp: data.whatsapp,
        addedByStaff: data.addedByStaff || false,
        status: "WAITING",
      },
      include: {
        service: true,
      }
    });
    return this.mapToDTO(queueItem);
  }

  async list(barbershopId?: string): Promise<IQueueItemResponseDTO[]> {
    const queueItems = await prisma.queueItem.findMany({
      where: barbershopId ? { barbershopId } : {},
      orderBy: { joinedAt: 'asc' },
      include: { service: true }
    });
    return queueItems.map(this.mapToDTO);
  }

  async findById(id: string): Promise<IQueueItemResponseDTO | null> {
    const item = await prisma.queueItem.findUnique({
      where: { id },
      include: { service: true }
    });
    return item ? this.mapToDTO(item) : null;
  }

  async updateStatus(id: string, status: string, details?: any): Promise<IQueueItemResponseDTO> {
    const data: any = { status: status as QueueStatus };
    if (status === 'COMPLETED') {
      data.completedAt = new Date();
      if (details?.completedBy) data.completedBy = details.completedBy;
      if (details?.finalPrice) data.finalPrice = details.finalPrice;
    }
    
    const item = await prisma.queueItem.update({
      where: { id },
      data,
      include: { service: true }
    });
    return this.mapToDTO(item);
  }

  async delete(id: string): Promise<void> {
    await prisma.queueItem.delete({ where: { id } });
  }

  async countCompleted(barbershopId?: string): Promise<number> {
    return await prisma.queueItem.count({
      where: {
        status: 'COMPLETED',
        ...(barbershopId ? { barbershopId } : {})
      }
    });
  }

  private mapToDTO(item: any): IQueueItemResponseDTO {
    return {
      id: item.id,
      barbershopId: item.barbershopId,
      serviceId: item.serviceId,
      customerId: item.customerId,
      customerName: item.customerName,
      whatsapp: item.whatsapp,
      joinedAt: item.joinedAt instanceof Date
        ? item.joinedAt.getTime()
        : Number(item.joinedAt),
      status: item.status,
      estimatedStartAt: item.estimatedStartAt instanceof Date
        ? item.estimatedStartAt.getTime()
        : item.estimatedStartAt ?? null,
      addedByStaff: item.addedByStaff,
      completedAt: item.completedAt instanceof Date
        ? item.completedAt.getTime()
        : item.completedAt ?? null,
      completedBy: item.completedBy ?? null,
      finalPrice: item.finalPrice ?? null,
      serviceName: item.service?.name ?? null
    };
  }
}
