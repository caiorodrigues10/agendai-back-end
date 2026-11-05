import { IServiceRepository } from "@/modules/services/repositories/IServiceRepository";
import { ICreateServiceDTO } from "@/modules/services/dtos/ICreateServiceDTO";
import { IUpdateServiceDTO } from "@/modules/services/dtos/IUpdateServiceDTO";
import { IServiceResponseDTO } from "@/modules/services/dtos/IServiceResponseDTO";
import type {
  IListServicesQuery,
  IServiceListResult,
} from "@/modules/services/dtos/IServiceListDTO";

export class MockServiceRepository implements IServiceRepository {
  private data: IServiceResponseDTO[] = [];
  private seq = 1;

  async create(payload: ICreateServiceDTO): Promise<IServiceResponseDTO> {
    const id = `service-${this.seq++}`;
    const now = new Date();
    const entity: IServiceResponseDTO = {
      id,
      categoryId: payload.categoryId ?? null,
      barbershopId: payload.barbershopId,
      name: payload.name,
      price: payload.price,
      avgTimeMinutes: payload.avgTimeMinutes,
      icon: payload.icon,
      createdAt: now,
      active: true,
      commissionPercent: payload.commissionPercent ?? 0,
      publicBookable: payload.publicBookable ?? true
    };
    this.data.push(entity);
    return entity;
  }

  async findById(id: string, barbershopId?: string): Promise<IServiceResponseDTO | null> {
    return this.data.find((s) => s.id === id && (!barbershopId || s.barbershopId === barbershopId)) ?? null;
  }

  async list(
    barbershopId?: string,
    options?: { includeInternal?: boolean }
  ): Promise<IServiceResponseDTO[]> {
    if (!barbershopId) return [];
    return this.data.filter(
      (s) => s.barbershopId === barbershopId && (options?.includeInternal || s.publicBookable)
    );
  }

  /**
   * Listagem paginada em memória.
   *
   * Espelha o `where` do repositório real (`serviceListWhere.ts`): salão do
   * contexto, `publicBookable` + `active` na visão pública, uma cláusula por
   * filtro (categoria, situação, busca por nome) e ordenação por
   * `nome`/`preco`/`duracao`/`criado` com `id` de desempate.
   */
  async listPaginated(
    barbershopId: string,
    query: IListServicesQuery,
    options?: { includeInternal?: boolean }
  ): Promise<IServiceListResult> {
    let results = this.data.filter((s) => s.barbershopId === barbershopId);

    if (!options?.includeInternal) {
      results = results.filter((s) => s.publicBookable && s.active);
    }

    if (query.categoryId) {
      results = results.filter((s) => s.categoryId === query.categoryId);
    }

    if (typeof query.active === "boolean") {
      results = results.filter((s) => s.active === query.active);
    }

    if (query.search) {
      const term = query.search.toLowerCase();
      results = results.filter((s) => s.name.toLowerCase().includes(term));
    }

    const dir = query.sort?.dir ?? "asc";
    const field = query.sort?.field;
    const sorted = [...results].sort((a, b) => {
      let cmp = 0;

      if (field === "preco") {
        cmp = a.price - b.price;
      } else if (field === "duracao") {
        cmp = a.avgTimeMinutes - b.avgTimeMinutes;
      } else if (field === "criado") {
        cmp = a.createdAt.getTime() - b.createdAt.getTime();
      } else {
        cmp = a.name.localeCompare(b.name);
      }

      if (cmp !== 0) return dir === "asc" ? cmp : -cmp;
      return dir === "asc" ? a.id.localeCompare(b.id) : b.id.localeCompare(a.id);
    });

    const total = sorted.length;
    const start = (query.page - 1) * query.limit;
    const data = sorted.slice(start, start + query.limit);

    return { data, total };
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
