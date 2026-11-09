import { inject, injectable } from "tsyringe";
import { IServiceRepository } from "../../repositories/IServiceRepository";
import { IServiceResponseDTO } from "../../dtos/IServiceResponseDTO";
import type {
  IListServicesQuery,
  IServiceListResult,
} from "../../dtos/IServiceListDTO";

@injectable()
export class ListServicesUseCase {
  constructor(
    @inject("ServiceRepository")
    private serviceRepository: IServiceRepository
  ) {}

  /**
   * Listagem simples (sem paginação) — mantida para os chamadores que
   * esperam um array (bot do dono, pacotes, regras de negócio).
   */
  async execute(
    barbershopId?: string,
    options?: { includeInternal?: boolean }
  ): Promise<IServiceResponseDTO[]> {
    return this.serviceRepository.list(barbershopId, options);
  }

  /**
   * Listagem paginada da rota `GET /api/services`.
   *
   * O salão vem do contexto resolvido no controller; os filtros (`search`,
   * `categoryId`, `active`) e a ordenação são opcionais.
   */
  async executePaginated(
    barbershopId: string,
    query: IListServicesQuery,
    options?: { includeInternal?: boolean }
  ): Promise<IServiceListResult> {
    return this.serviceRepository.listPaginated(barbershopId, query, options);
  }
}
