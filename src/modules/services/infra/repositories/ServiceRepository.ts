import { prisma } from "@/libs/prismaClient";
import { ICreateServiceDTO } from "../../dtos/ICreateServiceDTO";
import { IUpdateServiceDTO } from "../../dtos/IUpdateServiceDTO";
import { IServiceResponseDTO } from "../../dtos/IServiceResponseDTO";
import type {
  IListServicesQuery,
  IServiceListResult,
} from "../../dtos/IServiceListDTO";
import { IServiceRepository } from "../../repositories/IServiceRepository";
import {
  buildServiceListOrderBy,
  buildServiceListWhere,
} from "../../repositories/serviceListWhere";
import { toSkipTake } from "@/shared/utils/pagination";

/** Campos devolvidos na listagem e no CRUD de serviço. */
const serviceSelect = {
  id: true,
  categoryId: true,
  barbershopId: true,
  name: true,
  price: true,
  avgTimeMinutes: true,
  icon: true,
  createdAt: true,
  active: true,
  commissionPercent: true,
  publicBookable: true,
} as const;

export class ServiceRepository implements IServiceRepository {
  async create(data: ICreateServiceDTO): Promise<IServiceResponseDTO> {
    return prisma.service.create({
      data,
      select: serviceSelect,
    });
  }
  async findById(id: string, barbershopId?: string): Promise<IServiceResponseDTO | null> {
    return prisma.service.findFirst({
      where: { id, ...(barbershopId ? { barbershopId } : {}) },
      select: serviceSelect,
    });
  }
  async list(
    barbershopId?: string,
    options?: { includeInternal?: boolean }
  ): Promise<IServiceResponseDTO[]> {
    if (!barbershopId) return [];
    return prisma.service.findMany({
      where: {
        barbershopId,
        ...(options?.includeInternal ? {} : { publicBookable: true }),
      },
      orderBy: { name: "asc" },
      select: serviceSelect,
    });
  }

  /**
   * Listagem paginada do catálogo de serviços.
   *
   * `barbershopId` é sempre o salão do contexto — nenhum filtro da query
   * troca o salão. O `where` é montado por `buildServiceListWhere` (uma
   * cláusula por filtro) e o `orderBy` por `buildServiceListOrderBy` (whitelist
   * + `id` de desempate).
   */
  async listPaginated(
    barbershopId: string,
    query: IListServicesQuery,
    options?: { includeInternal?: boolean }
  ): Promise<IServiceListResult> {
    const { skip, take } = toSkipTake(query.page, query.limit);

    const where = buildServiceListWhere(barbershopId, query, options);
    const orderBy = buildServiceListOrderBy(query.sort);

    const [records, total] = await Promise.all([
      prisma.service.findMany({
        where,
        skip,
        take,
        orderBy,
        select: serviceSelect,
      }),
      // `total` conta o conjunto filtrado inteiro, não só a página.
      prisma.service.count({ where }),
    ]);

    return { data: records, total };
  }

  async update(id: string, data: IUpdateServiceDTO): Promise<IServiceResponseDTO> {
    return prisma.service.update({
      where: { id },
      data,
      select: serviceSelect,
    });
  }
  async deactivate(id: string): Promise<void> {
    await prisma.service.update({
      where: { id },
      data: { active: false }
    });
  }
}
