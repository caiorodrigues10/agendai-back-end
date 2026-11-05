import type { SortInput } from "@/shared/utils/pagination";
import type {
  IAdminTeamInvitation,
  IAdminTeamListFilters,
  IAdminTeamListItem,
} from "../dtos/IAdminTeamListDTO";

export interface IAdminTeamRepository {
  /**
   * Listagem paginada da equipe interna.
   *
   * O escopo é da plataforma (não há salão): sem `role`, só a equipe interna
   * (`MASTER_ADMIN`); com `role`, o papel pedido.
   */
  list(
    query: IAdminTeamListFilters & {
      page: number;
      limit: number;
      sort?: SortInput;
    },
  ): Promise<{ users: IAdminTeamListItem[]; total: number }>;
  /**
   * Convites internos (limite próprio, independente da paginação da equipe).
   */
  listInvitations(
    status?: "active" | "inactive",
  ): Promise<IAdminTeamInvitation[]>;
}
