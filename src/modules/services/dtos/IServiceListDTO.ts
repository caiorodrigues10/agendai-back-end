import type { SortInput } from "@/shared/utils/pagination";
import type { IServiceResponseDTO } from "./IServiceResponseDTO";

/**
 * Filtros da listagem de serviços (`GET /api/services`).
 *
 * O `barbershopId` NÃO é filtro: ele vem do contexto (primeiro argumento do
 * builder) e nenhum parâmetro da query consegue trocá-lo.
 *
 * O `active` é **opcional de propósito**: sem ele, serviço inativo continua
 * aparecendo na listagem — é o comportamento atual (a desativação é o
 * "removimento" do serviço) e não muda aqui.
 */
export interface IServiceListFilters {
  /** Busca livre pelo nome do serviço. */
  search?: string;
  /** Categoria do serviço (`ServiceCategory.id`). */
  categoryId?: string;
  /** Situação do serviço (ativo/inativo). */
  active?: boolean;
}

export interface IListServicesQuery extends IServiceListFilters {
  page: number;
  limit: number;
  sort?: SortInput;
}

export interface IServiceListResult {
  /** Serviços da página atual. */
  data: IServiceResponseDTO[];
  /** Total do conjunto filtrado inteiro (não só da página). */
  total: number;
}
