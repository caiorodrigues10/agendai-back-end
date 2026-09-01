import { ISalonClientRepository } from "@/modules/clients/repositories/ISalonClientRepository";
import {
  ICreateSalonClientDTO,
  IUpdateSalonClientDTO,
  ISalonClientListQuery,
  ISalonClientResponseDTO,
} from "@/modules/clients/dtos/ISalonClientDTO";
import { AppError } from "@/shared/errors/AppError";
import {
  salonClientCrmKey,
  salonClientDisplayName,
  salonClientPublicWhatsapp,
} from "@/modules/clients/utils/ensureSalonClient";

export class MockSalonClientRepository implements ISalonClientRepository {
  public clients: ISalonClientResponseDTO[] = [];
  private seq = 1;

  async create(data: ICreateSalonClientDTO): Promise<ISalonClientResponseDTO> {
    const dup = this.clients.find(
      (c) => c.barbershopId === data.barbershopId && c.whatsapp === data.whatsapp
    );
    if (dup) {
      throw new AppError("Já existe cliente com este WhatsApp neste salão", 409);
    }
    const now = new Date();
    const entity: ISalonClientResponseDTO = {
      id: `client-${this.seq++}`,
      barbershopId: data.barbershopId,
      name: data.name,
      whatsapp: data.whatsapp ?? "",
      normalizedWhatsapp: salonClientCrmKey(data.whatsapp ?? "", data.name),
      notes: data.notes ?? null,
      createdAt: now,
      updatedAt: now,
      remainingSessions: 0,
      activePackageCount: 0,
      packages: [],
      appointments: [],
    };
    this.clients.push(entity);
    return { ...entity, whatsapp: salonClientPublicWhatsapp(entity.whatsapp) };
  }

  async findById(id: string): Promise<ISalonClientResponseDTO | null> {
    const found = this.clients.find((c) => c.id === id);
    if (!found) return null;
    return { ...found, whatsapp: salonClientPublicWhatsapp(found.whatsapp) };
  }

  async findByWhatsapp(
    barbershopId: string,
    whatsapp: string
  ): Promise<ISalonClientResponseDTO | null> {
    const found = this.clients.find(
      (c) => c.barbershopId === barbershopId && c.whatsapp === whatsapp
    );
    return found
      ? { ...found, whatsapp: salonClientPublicWhatsapp(found.whatsapp) }
      : null;
  }

  async upsertFromVisit(
    barbershopId: string,
    name: string,
    whatsapp: string
  ): Promise<{ id: string } | null> {
    const key = salonClientCrmKey(whatsapp, name);
    const displayName = salonClientDisplayName(name);
    if (!key || !displayName) return null;
    const existing = this.clients.find(
      (c) => c.barbershopId === barbershopId && c.whatsapp === key
    );
    if (existing) {
      existing.name = displayName;
      existing.updatedAt = new Date();
      return { id: existing.id };
    }
    const created = await this.create({
      barbershopId,
      name: displayName,
      whatsapp: key,
    });
    return { id: created.id };
  }

  async list(
    query: ISalonClientListQuery & { barbershopId: string }
  ): Promise<{ data: ISalonClientResponseDTO[]; total: number }> {
    let results = this.clients.filter((c) => c.barbershopId === query.barbershopId);
    if (query.search) {
      const term = query.search.toLowerCase();
      const digits = query.search.replace(/\D/g, "");
      results = results.filter(
        (c) =>
          c.name.toLowerCase().includes(term) ||
          (digits && c.whatsapp.includes(digits))
      );
    }
    const total = results.length;
    const start = (query.page - 1) * query.limit;
    return {
      data: results.slice(start, start + query.limit).map((c) => ({
        ...c,
        whatsapp: salonClientPublicWhatsapp(c.whatsapp),
      })),
      total,
    };
  }

  async update(
    id: string,
    data: IUpdateSalonClientDTO
  ): Promise<ISalonClientResponseDTO> {
    const idx = this.clients.findIndex((c) => c.id === id);
    if (idx < 0) throw new AppError("Cliente não encontrado", 404);
    if (data.whatsapp) {
      const dup = this.clients.find(
        (c) =>
          c.id !== id &&
          c.barbershopId === this.clients[idx].barbershopId &&
          c.whatsapp === data.whatsapp
      );
      if (dup) {
        throw new AppError("Já existe cliente com este WhatsApp neste salão", 409);
      }
    }
    this.clients[idx] = {
      ...this.clients[idx],
      ...(data.name !== undefined && { name: data.name }),
      ...(data.whatsapp !== undefined && { whatsapp: data.whatsapp }),
      ...(data.notes !== undefined && { notes: data.notes }),
      updatedAt: new Date(),
    };
    return {
      ...this.clients[idx],
      whatsapp: salonClientPublicWhatsapp(this.clients[idx].whatsapp),
    };
  }

  async delete(id: string): Promise<void> {
    this.clients = this.clients.filter(c => c.id !== id);
  }
}
