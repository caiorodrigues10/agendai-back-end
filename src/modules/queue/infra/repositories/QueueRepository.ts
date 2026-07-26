import { prisma } from "@/libs/prismaClient";
import { IJoinQueueDTO } from "../../dtos/IJoinQueueDTO";
import { IQueueItemResponseDTO, QueueStatus } from "../../dtos/IQueueItemResponseDTO";
import { IQueueRepository } from "../../repositories/IQueueRepository";

type PrismaQueueStatus = "WAITING" | "IN_CHAIR" | "COMPLETED" | "CANCELLED";

function toDTO(s: PrismaQueueStatus): QueueStatus {
  return s.toLowerCase() as QueueStatus;
}

function toPrisma(s: string): PrismaQueueStatus {
  return s.toUpperCase() as PrismaQueueStatus;
}

export class QueueRepository implements IQueueRepository {
  async findActiveDuplicate(
    barbershopId: string,
    customerId: string,
    whatsappDigits: string
  ): Promise<IQueueItemResponseDTO | null> {
    const items = await prisma.queueItem.findMany({
      where: {
        barbershopId,
        status: { in: ["WAITING", "IN_CHAIR"] },
      },
      include: { service: true },
    });

    const duplicate = items.find(
      (i) =>
        i.customerId === customerId ||
        i.whatsapp.replace(/\D/g, "") === whatsappDigits
    );

    return duplicate ? this.mapToDTO(duplicate) : null;
  }

  async create(data: IJoinQueueDTO): Promise<IQueueItemResponseDTO> {
    const item = await prisma.queueItem.create({
      data: {
        barbershopId: data.barbershopId,
        serviceId:    data.serviceId,
        customerId:   data.customerId,
        customerName: data.customerName,
        whatsapp:     data.whatsapp,
        addedByStaff: data.addedByStaff ?? false,
        status:       "WAITING"
      },
      include: { service: true }
    });
    return this.mapToDTO(item);
  }

  async list(barbershopId?: string): Promise<IQueueItemResponseDTO[]> {
    const items = await prisma.queueItem.findMany({
      where:   barbershopId ? { barbershopId } : {},
      orderBy: { joinedAt: "asc" },
      include: { service: true }
    });
    return items.map((i: any) => this.mapToDTO(i));
  }

  async findById(id: string): Promise<IQueueItemResponseDTO | null> {
    const item = await prisma.queueItem.findUnique({
      where:   { id },
      include: { service: true }
    });
    return item ? this.mapToDTO(item) : null;
  }

  async updateStatus(
    id: string,
    status: string,
    details?: { completedBy?: string; finalPrice?: number }
  ): Promise<IQueueItemResponseDTO> {
    const prismaStatus = toPrisma(status);
    const data: Record<string, unknown> = { status: prismaStatus };

    if (prismaStatus === "COMPLETED") {
      data.completedAt = new Date();
      if (details?.completedBy)        data.completedBy = details.completedBy;
      if (details?.finalPrice != null) data.finalPrice  = details.finalPrice;
    }

    const item = await prisma.queueItem.update({
      where:   { id },
      data,
      include: { service: true }
    });
    return this.mapToDTO(item);
  }

  async delete(id: string): Promise<void> {
    await prisma.queueItem.delete({ where: { id } });
  }

  async countCompleted(barbershopId?: string): Promise<number> {
    return prisma.queueItem.count({
      where: {
        status: "COMPLETED",
        ...(barbershopId ? { barbershopId } : {})
      }
    });
  }

  private mapToDTO(item: any): IQueueItemResponseDTO {
    return {
      id:              item.id,
      barbershopId:    item.barbershopId,
      serviceId:       item.serviceId,
      customerId:      item.customerId,
      customerName:    item.customerName,
      whatsapp:        item.whatsapp,
      joinedAt:        item.joinedAt instanceof Date
                         ? item.joinedAt.getTime()
                         : Number(item.joinedAt),
      status:          toDTO(item.status),
      estimatedStartAt: item.estimatedStartAt instanceof Date
                         ? item.estimatedStartAt.getTime()
                         : (item.estimatedStartAt ?? null),
      addedByStaff:    item.addedByStaff,
      completedAt:     item.completedAt instanceof Date
                         ? item.completedAt.getTime()
                         : (item.completedAt ?? null),
      completedBy:     item.completedBy  ?? null,
      finalPrice:      item.finalPrice   ?? null,
      serviceName:     item.service?.name ?? null
    };
  }
}
