import { ICreateServiceDTO } from "../dtos/ICreateServiceDTO";
import { IUpdateServiceDTO } from "../dtos/IUpdateServiceDTO";
import { IServiceResponseDTO } from "../dtos/IServiceResponseDTO";
import type {
  IListServicesQuery,
  IServiceListResult,
} from "../dtos/IServiceListDTO";

export interface IServiceRepository {
  create(data: ICreateServiceDTO): Promise<IServiceResponseDTO>;
  findById(id: string, barbershopId?: string): Promise<IServiceResponseDTO | null>;
  /**
   * `includeInternal` false (padrão) devolve apenas serviços agendáveis pelo
   * público (`publicBookable = true`); a visão staff pede `true`.
   */
  list(barbershopId?: string, options?: { includeInternal?: boolean }): Promise<IServiceResponseDTO[]>;
  /**
   * Listagem paginada (filtros + ordenação).
   *
   * `barbershopId` é sempre o salão do contexto — nenhum filtro da query
   * troca o salão. Serviço inativo continua aparecendo quando o filtro
   * `active` não é informado (comportamento atual).
   */
  listPaginated(
    barbershopId: string,
    query: IListServicesQuery,
    options?: { includeInternal?: boolean },
  ): Promise<IServiceListResult>;
  update(id: string, data: IUpdateServiceDTO): Promise<IServiceResponseDTO>;
  deactivate(id: string): Promise<void>;
}
