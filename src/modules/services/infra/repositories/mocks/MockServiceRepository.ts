import { IServiceRepository } from "@/modules/services/repositories/IServiceRepository";
import { ICreateServiceDTO } from "@/modules/services/dtos/ICreateServiceDTO";
import { IUpdateServiceDTO } from "@/modules/services/dtos/IUpdateServiceDTO";
import { IServiceResponseDTO } from "@/modules/services/dtos/IServiceResponseDTO";

export class MockServiceRepository implements IServiceRepository {
  private data: IServiceResponseDTO[] = [];
  private seq = 1;

  async create(payload: ICreateServiceDTO): Promise<IServiceResponseDTO> {
    const id = `service-${this.seq++}`;
    const now = new Date();
    const entity: IServiceResponseDTO = {
      id,
      barbershopId: payload.barbershopId,
      categoryId: payload.categoryId ?? null,
      name: payload.name,
      price: payload.price,
      avgTimeMinutes: payload.avgTimeMinutes,
      icon: payload.icon,
      createdAt: now,
      active: true
    };
    this.data.push(entity);
    return entity;
  }

  async findById(id: string): Promise<IServiceResponseDTO | null> {
    return this.data.find((s) => s.id === id) ?? null;
  }

  async list(barbershopId?: string): Promise<IServiceResponseDTO[]> {
    if (!barbershopId) return [...this.data];
    return this.data.filter((s) => s.barbershopId === barbershopId);
  }

  async update(id: string, payload: IUpdateServiceDTO): Promise<IServiceResponseDTO> {
    const idx = this.data.findIndex((s) => s.id === id);
    if (idx < 0) throw new Error("not found");
    const current = this.data[idx];
    const updated: IServiceResponseDTO = {
      ...current,
      ...payload
    };
    this.data[idx] = updated;
    return updated;
  }

  async deactivate(id: string): Promise<void> {
    const entity = await this.findById(id);
    if (!entity) return;
    entity.active = false;
  }
}
