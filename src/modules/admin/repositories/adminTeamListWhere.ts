import type { Prisma } from "@prisma/client";
import type { SortInput } from "@/shared/utils/pagination";
import { buildUserListOrderBy } from "@/modules/users/repositories/userListWhere";
import type { IAdminTeamListFilters } from "../dtos/IAdminTeamListDTO";

/**
 * Monta o `where` da listagem da equipe interna do admin
 * (`GET /api/admin/team`).
 *
 * Regras:
 * - **Escopo da plataforma**: a rota não é por salão. Sem `role`, o escopo é a
 *   equipe interna (`role = MASTER_ADMIN`); com `role`, o escopo passa a ser o
 *   papel pedido — é o que o admin da plataforma enxerga além do dono.
 * - Cada filtro vira uma cláusula própria dentro de `AND`, para que o filtro
 *   de busca (que usa `OR` interno) não seja sobrescrito por outro.
 * - `status` mantém a semântica atual da rota: `active` ⇒ ativo e **não
 *   removido**; `inactive` ⇒ desativado **ou** removido; sem `status`, o
 *   removido fica de fora (o `deletedAt` preenchido é o corte).
 */
export function buildAdminTeamListWhere(
  query: IAdminTeamListFilters,
): Prisma.UserWhereInput {
  const and: Prisma.UserWhereInput[] = [];

  // Escopo: equipe interna por padrão; com `role`, o papel pedido.
  const scope: Prisma.UserWhereInput = query.role
    ? { role: query.role }
    : { role: "MASTER_ADMIN" };

  if (query.search) {
    and.push({
      OR: [
        { name: { contains: query.search, mode: "insensitive" } },
        { email: { contains: query.search, mode: "insensitive" } },
      ],
    });
  }

  if (typeof query.active === "boolean") {
    and.push({ active: query.active });
  }

  if (query.status === "active") {
    and.push({ active: true, deletedAt: null });
  } else if (query.status === "inactive") {
    and.push({ OR: [{ active: false }, { deletedAt: { not: null } }] });
  } else {
    and.push({ deletedAt: null });
  }

  return {
    ...scope,
    ...(and.length > 0 ? { AND: and } : {}),
  };
}

/**
 * `orderBy` da listagem da equipe interna.
 *
 * Reaproveita o helper da listagem do dono (`buildUserListOrderBy`), que já
 * faz a whitelist `nome`/`email`/`cargo`/`criado` com `id` de desempate.
 *
 * Sem `sort`, o resultado é o ordenamento atual da rota: `createdAt` desc
 * (com `id` desc de desempate, para a paginação ser estável).
 */
export function buildAdminTeamListOrderBy(
  sort?: SortInput,
): Prisma.UserOrderByWithRelationInput[] {
  // Campo fora da whitelist cai no ordenamento padrão da rota
  // (`createdAt desc`), não no padrão do helper do dono.
  const allowed = ["nome", "email", "cargo", "criado"];
  const safeSort =
    sort && allowed.includes(sort.field)
      ? sort
      : { field: "criado", dir: "desc" as const };

  return buildUserListOrderBy(safeSort);
}
