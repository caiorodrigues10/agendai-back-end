import { IBarbershopRepository, IPageThemeDTO, IUpdatePageThemeDTO } from "@/modules/barbershops/repositories/IBarbershopRepository";
import { ICreateBarbershopDTO } from "@/modules/barbershops/dtos/ICreateBarbershopDTO";
import { IUpdateBarbershopDTO } from "@/modules/barbershops/dtos/IUpdateBarbershopDTO";
import { IBarbershopResponseDTO } from "@/modules/barbershops/dtos/IBarbershopResponseDTO";

type ScheduleItem = { dayOfWeek: number; isOpen: boolean; openTime: string; closeTime: string };

export class MockBarbershopRepository implements IBarbershopRepository {
  private data: IBarbershopResponseDTO[] = [];
  private schedules: Record<string, ScheduleItem[]> = {};
  private pageThemes: Map<string, IPageThemeDTO> = new Map();
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
      operationMode: 'HYBRID',
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
  async findByIdPublic(id: string): Promise<IBarbershopResponseDTO | null> {
    const shop = this.data.find((b) => b.id === id);
    return shop ? this.toPublic(shop) : null;
  }
  async list(): Promise<IBarbershopResponseDTO[]> {
    return this.data.map((shop) => this.toPublic(shop));
  }
  /** Réplica do `publicShopSelect` do repositório real: sem `evolutionInstanceName`. */
  private toPublic(shop: IBarbershopResponseDTO): IBarbershopResponseDTO {
    const { evolutionInstanceName: _evolutionInstanceName, ...rest } = shop;
    return rest;
  }
  async update(id: string, payload: IUpdateBarbershopDTO): Promise<IBarbershopResponseDTO> {
    const idx = this.data.findIndex((b) => b.id === id);
    if (idx < 0) throw new Error("not found");
    const current = this.data[idx];
    const updated: IBarbershopResponseDTO = {
      ...current,
      ...payload,
      // string vazia é normalizada para null (salão sem pairing).
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
  async findPageTheme(barbershopId: string): Promise<IPageThemeDTO | null> {
    return this.pageThemes.get(barbershopId) ?? null;
  }
  async upsertPageTheme(barbershopId: string, data: IUpdatePageThemeDTO): Promise<IPageThemeDTO> {
    const existing = this.pageThemes.get(barbershopId);
    const theme: IPageThemeDTO = {
      id: existing?.id ?? `theme-${barbershopId}`,
      barbershopId,
      presetKey: data.presetKey ?? null,
      accentColor: data.accentColor,
      backgroundColor: data.backgroundColor,
      surfaceColor: data.surfaceColor,
      textColor: data.textColor,
      textMutedColor: data.textMutedColor,
      radiusStyle: data.radiusStyle,
      buttonStyle: data.buttonStyle,
      coverUrl: data.coverUrl ?? null,
      coverPublicId: data.coverPublicId ?? null,
      coverOverlay: data.coverOverlay,
    };
    this.pageThemes.set(barbershopId, theme);
    return theme;
  }
}
