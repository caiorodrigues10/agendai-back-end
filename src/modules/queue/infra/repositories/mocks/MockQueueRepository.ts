import { IQueueRepository } from "@/modules/queue/repositories/IQueueRepository";
import { IJoinQueueDTO } from "@/modules/queue/dtos/IJoinQueueDTO";
import { IQueueItemResponseDTO } from "@/modules/queue/dtos/IQueueItemResponseDTO";
import { AppError } from "@/shared/errors/AppError";

export class MockQueueRepository implements IQueueRepository {
  private data: IQueueItemResponseDTO[] = [];
  private seq = 1;

  async create(payload: IJoinQueueDTO): Promise<IQueueItemResponseDTO> {
    const id = `queue-${this.seq++}`;
    const now = Date.now();
    const entity: IQueueItemResponseDTO = {
      id,
      barbershopId: payload.barbershopId,
      serviceId: payload.serviceId,
      customerId: payload.customerId,
      customerName: payload.customerName,
      whatsapp: payload.whatsapp,
      joinedAt: now,
      status: "waiting",
      addedByStaff: payload.addedByStaff ?? false,
    };
    this.data.push(entity);
    return entity;
  }

  async list(barbershopId?: string): Promise<IQueueItemResponseDTO[]> {
    if (!barbershopId) return [...this.data];
    return this.data.filter((q) => q.barbershopId === barbershopId);
  }

  async findById(id: string): Promise<IQueueItemResponseDTO | null> {
    return this.data.find((q) => q.id === id) ?? null;
  }

  async updateStatus(
    id: string,
    status: string,
    details?: any
  ): Promise<IQueueItemResponseDTO> {
    const idx = this.data.findIndex((q) => q.id === id);
    if (idx < 0) throw new AppError("Item de fila não encontrado", 404);

    const current = this.data[idx];
    const patch: Partial<IQueueItemResponseDTO> = { status: status as any };

    if (status === "completed") {
      patch.completedAt = Date.now();
      if (details?.completedBy) patch.completedBy = details.completedBy;
      if (details?.finalPrice != null) patch.finalPrice = details.finalPrice;
    }

    const updated = { ...current, ...patch };
    this.data[idx] = updated;
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.data = this.data.filter((q) => q.id !== id);
  }

  async countCompleted(barbershopId?: string): Promise<number> {
    return this.data.filter(
      (q) =>
        q.status === "completed" &&
        (!barbershopId || q.barbershopId === barbershopId)
    ).length;
  }
}
