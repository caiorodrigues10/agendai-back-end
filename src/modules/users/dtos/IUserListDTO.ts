import type { Role } from "@prisma/client";
import type { SortInput } from "@/shared/utils/pagination";

/**
 * Filtros da listagem da equipe do dono (`GET /api/users`).
 *
 * O `barbershopId` NÃO faz parte dos filtros: ele vem sempre do contexto
 * (sessão do OWNER ou `?barbershopId=` do MASTER_ADMIN) e nunca da query.
 */
export interface IUserListFilters {
  /** Busca livre por nome ou e-mail (sem distinção de maiúsculas). */
  search?: string;
  /** Papel do membro da equipe. */
  role?: Role;
  /** Situação do membro (ativo/inativo). */
  active?: boolean;
}

export interface IListTeamQuery extends IUserListFilters {
  page: number;
  limit: number;
  sort?: SortInput;
}

/**
 * Item da listagem da equipe.
 *
 * É o **único** formato que sai da rota: nada de `password` (hash), `googleSub`,
 * `cpf`, `deletedAt` ou das relações de token (`refreshTokens`, `userSessions`).
 */
export interface IUserListItem {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  barbershopId: string | null;
  createdAt: Date;
  avatarUrl: string | null;
  permissions: string[];
}

export interface IUserListResult {
  /** Membros da página atual. */
  data: IUserListItem[];
  /** Total do conjunto filtrado inteiro (não só da página). */
  total: number;
}
