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
import { utcDayBounds } from "@/shared/utils/dateUtils";
import { inactiveThreshold } from "@/modules/clients/repositories/salonClientListWhere";

/**
 * Cliente do mock. Além do DTO público, carrega os dados que os filtros
 * novos da listagem precisam (`lastVisitAt` e os fiados vinculados) sem
 * alterar o contrato exposto pela API.
 */
export type MockSalonClient = ISalonClientResponseDTO & {
  lastVisitAt?: Date | null;
  openFiados?: { status: string; barbershopId: string }[];
};

export class MockSalonClientRepository implements ISalonClientRepository {
  public clients: MockSalonClient[] = [];
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
    if (query.createdFrom) {
      const from = utcDayBounds(query.createdFrom).gte;
      results = results.filter((c) => c.createdAt >= from);
    }
    if (query.createdTo) {
      const to = utcDayBounds(query.createdTo).lt;
      results = results.filter((c) => c.createdAt < to);
    }
    if (query.inactiveDays !== undefined) {
      const threshold = inactiveThreshold(query.inactiveDays);
      results = results.filter(
        (c) =>
          (c.lastVisitAt != null && c.lastVisitAt < threshold) ||
          (c.lastVisitAt == null && c.createdAt < threshold)
      );
    }
    if (query.hasOpenFiado !== undefined) {
      const hasOpen = (c: MockSalonClient) =>
        (c.openFiados ?? []).some(
          (f) =>
            f.barbershopId === c.barbershopId &&
            (f.status === "PENDING" || f.status === "PARTIAL")
        );
      results = results.filter((c) =>
        query.hasOpenFiado ? hasOpen(c) : !hasOpen(c)
      );
    }
    if (query.hasActivePackage !== undefined) {
      const hasActive = (c: MockSalonClient) =>
        (c.packages ?? []).some((p) => p.status === "ACTIVE");
      results = results.filter((c) =>
        query.hasActivePackage ? hasActive(c) : !hasActive(c)
      );
    }

    const sort = query.sort;
    if (sort) {
      const dir = sort.dir === "desc" ? -1 : 1;
      results = [...results].sort((a, b) => {
        if (sort.field === "createdAt") {
          return (a.createdAt.getTime() - b.createdAt.getTime()) * dir;
        }
        if (sort.field === "lastVisitAt") {
          // nulo sempre por último, nas duas direções (igual ao `nulls: "last"`)
          const av = a.lastVisitAt?.getTime() ?? null;
          const bv = b.lastVisitAt?.getTime() ?? null;
          if (av === null && bv === null) return 0;
          if (av === null) return 1;
          if (bv === null) return -1;
          return (av - bv) * dir;
        }
        return a.name.localeCompare(b.name) * dir;
      });
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
