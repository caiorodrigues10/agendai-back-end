import { IBarbershopRepository } from "@/modules/barbershops/repositories/IBarbershopRepository";
import { ICreateBarbershopDTO } from "@/modules/barbershops/dtos/ICreateBarbershopDTO";
import { IUpdateBarbershopDTO } from "@/modules/barbershops/dtos/IUpdateBarbershopDTO";
import { IBarbershopResponseDTO } from "@/modules/barbershops/dtos/IBarbershopResponseDTO";

type ScheduleItem = { dayOfWeek: number; isOpen: boolean; openTime: string; closeTime: string };

export class MockBarbershopRepository implements IBarbershopRepository {
  private data: IBarbershopResponseDTO[] = [];
  private schedules: Record<string, ScheduleItem[]> = {};
  private seq = 1;

  async create(payload: ICreateBarbershopDTO): Promise<IBarbershopResponseDTO> {
    const id = `shop-${this.seq++}`;
    const now = new Date();
    const entity: IBarbershopResponseDTO = {
      id,
      name: payload.name,
      whatsapp: payload.whatsapp,
      logoUrl: payload.logoUrl ?? null,
      cnpj: null,
      address: null,
      createdAt: now,
      active: true,
      evolutionInstanceName: null
    };
    this.data.push(entity);
    this.schedules[id] = [];
    return entity;
  }
  async findById(id: string): Promise<IBarbershopResponseDTO | null> {
    return this.data.find((b) => b.id === id) ?? null;
  }
  async list(): Promise<IBarbershopResponseDTO[]> {
    return [...this.data];
  }
  async update(id: string, payload: IUpdateBarbershopDTO): Promise<IBarbershopResponseDTO> {
    const idx = this.data.findIndex((b) => b.id === id);
    if (idx < 0) throw new Error("not found");
    const current = this.data[idx];
    const updated: IBarbershopResponseDTO = {
      ...current,
      ...payload,
      // string vazia é normalizada para null: sinaliza "sem instância própria, usar fallback".
      evolutionInstanceName:
        payload.evolutionInstanceName === ""
          ? null
          : payload.evolutionInstanceName === undefined
            ? current.evolutionInstanceName
            : payload.evolutionInstanceName
    } as IBarbershopResponseDTO;
    this.data[idx] = updated;
    return updated;
  }
  async deactivate(id: string): Promise<void> {
    const entity = await this.findById(id);
    if (!entity) return;
    entity.active = false;
  }
  async getSchedule(barbershopId: string): Promise<ScheduleItem[]> {
    return [...(this.schedules[barbershopId] ?? [])];
  }
  async updateSchedule(barbershopId: string, schedule: ScheduleItem[]): Promise<void> {
    this.schedules[barbershopId] = [...schedule];
  }
}
