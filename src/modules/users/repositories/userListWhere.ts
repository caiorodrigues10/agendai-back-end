import type { Prisma } from "@prisma/client";
import type { SortInput } from "@/shared/utils/pagination";
import type { IUserListFilters } from "../dtos/IUserListDTO";

/**
 * Monta o `where` da listagem da equipe do dono (`GET /api/users`).
 *
 * Regras:
 * - `barbershopId` vem SEMPRE do contexto (primeiro argumento) e nunca de um
 *   filtro da query — nenhum parâmetro aceito aqui consegue trocar o salão.
 * - Cada filtro vira uma cláusula própria dentro de `AND`, para que o filtro
 *   de busca (que usa `OR` interno) não seja sobrescrito por outro.
 * - Membro removido (`deletedAt`) **nunca** aparece na listagem: a remoção é
 *   soft-delete (`active = false` + `deletedAt`), e o `deletedAt` é o corte
 *   definitivo — o filtro `active` filtra a situação, não a exclusão.
 */
export function buildUserListWhere(
  barbershopId: string,
  query: IUserListFilters,
): Prisma.UserWhereInput {
  const and: Prisma.UserWhereInput[] = [];

  if (query.search) {
    and.push({
      OR: [
        { name: { contains: query.search, mode: "insensitive" } },
        { email: { contains: query.search, mode: "insensitive" } },
      ],
    });
  }

  if (query.role) {
    and.push({ role: query.role });
  }

  if (typeof query.active === "boolean") {
    and.push({ active: query.active });
  }

  return {
    barbershopId,
    deletedAt: null,
    ...(and.length > 0 ? { AND: and } : {}),
  };
}

/**
 * `orderBy` da listagem da equipe.
 *
 * - `nome` => `{ name: dir }`
 * - `email` => `{ email: dir }`
 * - `cargo` => `{ role: dir }`
 * - `criado` => `{ createdAt: dir }`
 * - `id` sempre por último, como desempate estável para a paginação.
 *
 * Sem `sort`, o resultado é o ordenamento atual: `createdAt` asc, `id` asc.
 */
export function buildUserListOrderBy(
  sort?: SortInput,
): Prisma.UserOrderByWithRelationInput[] {
  const dir = sort?.dir ?? "asc";

  switch (sort?.field) {
    case "nome":
      return [{ name: dir }, { id: dir }];
    case "email":
      return [{ email: dir }, { id: dir }];
    case "cargo":
      return [{ role: dir }, { id: dir }];
    case "criado":
      return [{ createdAt: dir }, { id: dir }];
    default:
      return [{ createdAt: "asc" }, { id: "asc" }];
  }
}
