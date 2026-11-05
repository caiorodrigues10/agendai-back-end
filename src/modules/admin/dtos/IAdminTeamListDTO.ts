import type { Role } from "@prisma/client";
import type { SortInput } from "@/shared/utils/pagination";

/**
 * Filtros da listagem da equipe interna do admin (`GET /api/admin/team`).
 *
 * Diferença de escopo em relação à listagem do dono (`GET /api/users`):
 *
 * - A rota do dono é **por salão**: o `barbershopId` vem do contexto e o filtro
 *   `role` aceita só `OWNER`/`EMPLOYEE` (os papéis que formam a equipe do
 *   salão) — `MASTER_ADMIN` e `CUSTOMER` devolvem 400.
 * - A rota do admin é **da plataforma**: não tem salão. O escopo padrão é a
 *   equipe interna (`role = MASTER_ADMIN`) e, quando o admin informa `role`,
 *   o escopo passa a ser o papel pedido — o admin enxerga **mais papéis** que
 *   o dono (`OWNER`, `EMPLOYEE` também).
 *
 * O `status` mantém a semântica atual da rota: `active` só mostra quem está
 * ativo e **não removido**; `inactive` mostra quem está desativado **e** quem
 * foi removido (`deletedAt` preenchido) — o admin precisa enxergar o membro
 * removido; sem `status`, a listagem esconde o removido.
 */
export interface IAdminTeamListFilters {
  /** Busca livre por nome ou e-mail (sem distinção de maiúsculas). */
  search?: string;
  /** Situação: `active` (ativo e não removido) ou `inactive` (desativado/removido). */
  status?: "active" | "inactive";
  /** Situação do membro (ativo/inativo), filtro independente do `status`. */
  active?: boolean;
  /** Papel do membro. Whitelist da plataforma (veja a nota acima). */
  role?: Exclude<Role, "CUSTOMER">;
}

export interface IAdminTeamListQuery extends IAdminTeamListFilters {
  page: number;
  limit: number;
  sort?: SortInput;
}

/**
 * Item da listagem da equipe interna.
 *
 * É o **único** formato que sai da rota: nada de `password` (hash),
 * `googleSub`, `cpf`, `deletedAt` ou das relações de token (`refreshTokens`,
 * `userSessions`).
 */
export interface IAdminTeamListItem {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  _count: {
    ticketsAssigned: number;
    tasksAssigned: number;
  };
}

/** Convite interno exibido junto da equipe (sem o hash do token). */
export interface IAdminTeamInvitation {
  id: string;
  email: string;
  status: string;
  permissions: string[];
  expiresAt: Date;
  createdAt: Date;
  invitedBy: { name: string };
}

export interface IAdminTeamListResult {
  /** Membros da página atual. */
  users: IAdminTeamListItem[];
  /** Convites internos (limite próprio, independente da paginação). */
  invitations: IAdminTeamInvitation[];
  /** Total do conjunto filtrado inteiro (não só da página). */
  total: number;
}
