import { prisma } from "@/libs/prismaClient";
import { Prisma } from "@prisma/client";
import { IJoinQueueDTO } from "../../dtos/IJoinQueueDTO";
import { IQueueItemResponseDTO, QueueStatus } from "../../dtos/IQueueItemResponseDTO";
import { IQueueRepository } from "../../repositories/IQueueRepository";
import { isActiveQueueDuplicate } from "../../utils/queueDuplicate";

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
    whatsappDigits: string,
    customerName: string
  ): Promise<IQueueItemResponseDTO | null> {
    const items = await prisma.queueItem.findMany({
      where: {
        barbershopId,
        status: { in: ["WAITING", "IN_CHAIR"] },
      },
      include: { service: true },
    });

    const duplicate = items.find((i: any) =>
      isActiveQueueDuplicate(i, { customerId, whatsappDigits, customerName })
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
        responsibleQueueItemId: data.responsibleQueueItemId ?? null,
        status:       "WAITING"
      },
      include: { service: true, responsibleQueueItem: { select: { customerName: true, customerId: true } } }
    });
    return this.mapToDTO(item);
  }

  async list(barbershopId?: string): Promise<IQueueItemResponseDTO[]> {
    const items = await prisma.queueItem.findMany({
      where:   barbershopId ? { barbershopId } : {},
      orderBy: { joinedAt: "asc" },
      include: { service: true, responsibleQueueItem: { select: { customerName: true, customerId: true } } }
    });
    return items.map((i: any) => this.mapToDTO(i));
  }

  async findById(id: string): Promise<IQueueItemResponseDTO | null> {
    const item = await prisma.queueItem.findUnique({
      where:   { id },
      include: { service: true, responsibleQueueItem: { select: { customerName: true, customerId: true } } }
    });
    return item ? this.mapToDTO(item) : null;
  }

  async updateStatus(
    id: string,
    status: string,
    details?: { completedBy?: string; finalPrice?: number; paymentMethod?: string; joinedAt?: Date }
  ): Promise<IQueueItemResponseDTO> {
    const prismaStatus = toPrisma(status);
    const data: Record<string, unknown> = { status: prismaStatus };

    if (prismaStatus === "IN_CHAIR") {
      data.calledAt = new Date();
    }

    if (prismaStatus === "COMPLETED") {
      data.completedAt = new Date();
      if (details?.completedBy)        data.completedBy = details.completedBy;
      if (details?.finalPrice != null) data.finalPrice  = details.finalPrice;
      if (details?.paymentMethod)     data.paymentMethod = details.paymentMethod;
    }

    if (prismaStatus === "WAITING" && details?.joinedAt) {
      data.joinedAt = details.joinedAt;
    }

    const item = await prisma.queueItem.update({
      where:   { id },
      data,
      include: { service: true, responsibleQueueItem: { select: { customerName: true, customerId: true } } }
    });
    return this.mapToDTO(item);
  }

  async assignClient(id: string, clientId: string): Promise<void> {
    await prisma.queueItem.update({ where: { id }, data: { clientId } });
  }

  async completeWithCommissions(
    id: string,
    details: {
      completedBy?: string;
      finalPrice: number;
      paymentMethod?: string;
      splits: Array<{ professionalId: string; percentage: number }>;
    },
  ): Promise<IQueueItemResponseDTO> {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const queueItem = await tx.queueItem.findUnique({
        where: { id },
        select: { barbershopId: true, serviceId: true },
      });
      if (!queueItem) throw new Error("QUEUE_ITEM_NOT_FOUND");
      const updated = await tx.queueItem.updateMany({
        where: { id, status: "IN_CHAIR" },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          ...(details.completedBy ? { completedBy: details.completedBy } : {}),
          finalPrice: details.finalPrice,
          ...(details.paymentMethod ? { paymentMethod: details.paymentMethod } : {}),
        },
      });
      if (updated.count !== 1) {
        throw new Error("QUEUE_ITEM_ALREADY_COMPLETED");
      }
      await tx.commissionEntry.createMany({
        data: details.splits.map((split) => ({
          barbershopId: queueItem.barbershopId,
          queueItemId: id,
          serviceId: queueItem.serviceId,
          professionalId: split.professionalId,
          percentage: split.percentage,
          amount: Math.round(details.finalPrice * split.percentage) / 100,
        })),
      });
    }).catch((error: unknown) => {
      if (error instanceof Error && error.message === "QUEUE_ITEM_ALREADY_COMPLETED") {
        throw new Error("QUEUE_ITEM_ALREADY_COMPLETED");
      }
      throw error;
    });
    return this.findById(id) as Promise<IQueueItemResponseDTO>;
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

  async findActiveInLine(barbershopId: string): Promise<IQueueItemResponseDTO[]> {
    const items = await prisma.queueItem.findMany({
      where: { barbershopId, status: { in: ["WAITING", "IN_CHAIR"] } },
      orderBy: { joinedAt: "asc" },
      include: { service: true, responsibleQueueItem: { select: { customerName: true, customerId: true } } },
    });
    return items.map((i: any) => this.mapToDTO(i));
  }

  async findWaitingByBarbershop(barbershopId: string): Promise<IQueueItemResponseDTO[]> {
    const items = await prisma.queueItem.findMany({
      where: { barbershopId, status: "WAITING" },
      orderBy: { joinedAt: "asc" },
      include: { service: true, responsibleQueueItem: { select: { customerName: true, customerId: true } } },
    });
    return items.map((i: any) => this.mapToDTO(i));
  }

  async markNotifiedPosition(id: string, position: number): Promise<void> {
    await prisma.queueItem.update({
      where: { id },
      data: { lastNotifiedPosition: position },
    });
  }

  private mapToDTO(item: any): IQueueItemResponseDTO {
    return {
      id:              item.id,
      barbershopId:    item.barbershopId,
      serviceId:       item.serviceId,
      customerId:      item.customerId,
      clientId:        item.clientId ?? null,
      customerName:    item.customerName,
      whatsapp:        item.whatsapp,
      joinedAt:        item.joinedAt instanceof Date
                         ? item.joinedAt.getTime()
                         : Number(item.joinedAt),
      calledAt:        item.calledAt instanceof Date
                         ? item.calledAt.getTime()
                         : (item.calledAt ?? null),
      status:          toDTO(item.status),
      estimatedStartAt: item.estimatedStartAt instanceof Date
                         ? item.estimatedStartAt.getTime()
                         : (item.estimatedStartAt ?? null),
      lastNotifiedPosition: item.lastNotifiedPosition ?? null,
      addedByStaff:    item.addedByStaff,
      responsibleQueueItemId: item.responsibleQueueItemId ?? null,
      responsibleName: item.responsibleQueueItem?.customerName ?? null,
      responsibleCustomerId: item.responsibleQueueItem?.customerId ?? null,
      completedAt:     item.completedAt instanceof Date
                         ? item.completedAt.getTime()
                         : (item.completedAt ?? null),
      completedBy:     item.completedBy  ?? null,
      finalPrice:      item.finalPrice   ?? null,
      paymentMethod:   item.paymentMethod ?? null,
      serviceName:     item.service?.name ?? null,
      serviceAvgTimeMinutes: item.service?.avgTimeMinutes ?? null,
    };
  }
}
