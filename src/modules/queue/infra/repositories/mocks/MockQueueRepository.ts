import { IQueueRepository } from "@/modules/queue/repositories/IQueueRepository";
import { IJoinQueueDTO } from "@/modules/queue/dtos/IJoinQueueDTO";
import { IQueueItemResponseDTO } from "@/modules/queue/dtos/IQueueItemResponseDTO";
import { AppError } from "@/shared/errors/AppError";
import { isActiveQueueDuplicate } from "@/modules/queue/utils/queueDuplicate";

export class MockQueueRepository implements IQueueRepository {
  public data: IQueueItemResponseDTO[] = [];
  /** Itens arquivados (archive) — espelha o filtro `archivedAt: null` do Prisma. */
  public archivedIds = new Set<string>();
  /** Fiados solicitados dentro da conclusão (espelha a tx.fiado.create do repo). */
  public createdFiados: Array<{
    customerName: string;
    whatsapp: string;
    clientId: string | null;
    description: string;
    originalAmount: number;
    createdById: string;
    id: string;
  }> = [];
  private seq = 1;
  private fiadoSeq = 1;

  async findActiveDuplicate(
    barbershopId: string,
    customerId: string,
    whatsappDigits: string,
    customerName: string
  ): Promise<IQueueItemResponseDTO | null> {
    return (
      this.data.find(
        (q) =>
          !this.archivedIds.has(q.id) &&
          q.barbershopId === barbershopId &&
          (q.status === "waiting" || q.status === "in_chair") &&
          isActiveQueueDuplicate(q, { customerId, whatsappDigits, customerName })
      ) ?? null
    );
  }

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
      responsibleQueueItemId: payload.responsibleQueueItemId ?? null,
    };
    this.data.push(entity);
    return entity;
  }

  async assignClient(id: string, clientId: string): Promise<void> {
    const index = this.data.findIndex((item) => item.id === id);
    if (index >= 0) this.data[index] = { ...this.data[index], clientId };
  }

  async list(
    barbershopId?: string,
    options?: { statuses?: readonly ("WAITING" | "IN_CHAIR" | "COMPLETED" | "CANCELLED")[] }
  ): Promise<IQueueItemResponseDTO[]> {
    const statuses = (options?.statuses ?? ["WAITING", "IN_CHAIR"]).map(s => s.toLowerCase());
    let result = this.data.filter((q) => !this.archivedIds.has(q.id));
    if (barbershopId) result = result.filter((q) => q.barbershopId === barbershopId);
    return result.filter((q) => statuses.includes(q.status));
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

    if (status === "in_chair") patch.calledAt = Date.now();

    if (status === "completed") {
      patch.completedAt = Date.now();
      if (details?.completedBy) patch.completedBy = details.completedBy;
      if (details?.finalPrice != null) patch.finalPrice = details.finalPrice;
      if (details?.paymentMethod) patch.paymentMethod = details.paymentMethod;
    }

    if (status === "waiting" && details?.joinedAt) {
      const at = details.joinedAt;
      patch.joinedAt = at instanceof Date ? at.getTime() : Number(at);
    }

    const updated = { ...current, ...patch };
    this.data[idx] = updated;
    return updated;
  }

  async completeWithCommissions(
    id: string,
    details: {
      completedBy?: string;
      finalPrice: number;
      paymentMethod?: string;
      splits: Array<{ professionalId: string; percentage: number }>;
      fiado?: {
        customerName: string;
        whatsapp: string;
        clientId: string | null;
        description: string;
        createdById: string;
      } | null;
    },
  ): Promise<{ item: IQueueItemResponseDTO; createdFiadoId: string | null }> {
    // Mesma guarda da transação real: só IN_CHAIR conclui; repetição/corrida recusa.
    const current = this.data.find((q) => q.id === id);
    if (current && current.status !== "in_chair") throw new Error("QUEUE_ITEM_ALREADY_COMPLETED");
    const item = await this.updateStatus(id, "completed", details);
    let createdFiadoId: string | null = null;
    if (details.fiado) {
      const fid = `fiado-${this.fiadoSeq++}`;
      createdFiadoId = fid;
      this.createdFiados.push({
        ...details.fiado,
        id: fid,
        originalAmount: details.finalPrice,
      });
    }
    return { item, createdFiadoId };
  }

  async archive(id: string, details: { archivedBy: string; reason?: string | null }): Promise<void> {
    const idx = this.data.findIndex((q) => q.id === id);
    if (idx < 0) throw new AppError("Item de fila não encontrado", 404);
    this.archivedIds.add(id);
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

  async findActiveInLine(barbershopId: string): Promise<IQueueItemResponseDTO[]> {
    return this.data
      .filter(
        (q) =>
          !this.archivedIds.has(q.id) &&
          q.barbershopId === barbershopId &&
          (q.status === "waiting" || q.status === "in_chair")
      )
      .sort((a, b) => a.joinedAt - b.joinedAt);
  }

  async findWaitingByBarbershop(barbershopId: string): Promise<IQueueItemResponseDTO[]> {
    return this.data
      .filter(
        (q) =>
          !this.archivedIds.has(q.id) &&
          q.barbershopId === barbershopId &&
          q.status === "waiting"
      )
      .sort((a, b) => a.joinedAt - b.joinedAt);
  }

  async markNotifiedPosition(id: string, position: number): Promise<void> {
    const idx = this.data.findIndex((q) => q.id === id);
    if (idx >= 0) {
      this.data[idx] = {
        ...this.data[idx],
        lastNotifiedPosition: position,
      };
    }
  }
}
