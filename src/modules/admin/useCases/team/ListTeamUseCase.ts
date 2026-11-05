import { inject, injectable } from "tsyringe";
import type {
  IAdminTeamInvitation,
  IAdminTeamListFilters,
  IAdminTeamListItem,
} from "../../dtos/IAdminTeamListDTO";
import type { IAdminTeamRepository } from "../../repositories/IAdminTeamRepository";
import type { SortInput } from "@/shared/utils/pagination";

@injectable()
export class ListTeamUseCase {
  constructor(
    @inject("AdminTeamRepository")
    private adminTeamRepository: IAdminTeamRepository,
  ) {}

  /**
   * Lista a equipe interna da plataforma (`GET /api/admin/team`).
   *
   * A paginação é do chamador (`page`/`limit`): o default **25** vem do
   * schema da rota e é o que a tela do master usa quando não manda `limit`.
   *
   * O escopo é da plataforma: sem `role`, só a equipe interna
   * (`MASTER_ADMIN`); com `role`, o papel pedido — o admin da plataforma
   * enxerga mais papéis que o dono da equipe do salão.
   */
  async execute(query: {
    page: number;
    limit: number;
    search?: string;
    status?: "active" | "inactive";
    active?: boolean;
    role?: IAdminTeamListFilters["role"];
    sort?: SortInput;
  }): Promise<{
    users: IAdminTeamListItem[];
    invitations: IAdminTeamInvitation[];
    total: number;
  }> {
    const { users, total } = await this.adminTeamRepository.list(query);
    const invitations = await this.adminTeamRepository.listInvitations(query.status);

    return { users, invitations, total };
  }
}
