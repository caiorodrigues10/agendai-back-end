import type { Prisma } from "@prisma/client";
import type { SortInput } from "@/shared/utils/pagination";
import type { IServiceListFilters } from "../dtos/IServiceListDTO";

/**
 * Monta o `where` da listagem de serviços (`GET /api/services`).
 *
 * Regras:
 * - `barbershopId` vem SEMPRE do contexto (primeiro argumento) e nunca de um
 *   filtro da query — nenhum parâmetro aceito aqui consegue trocar o salão.
 * - Cada filtro vira uma cláusula própria dentro de `AND`, para que o filtro
 *   de busca (que usa `OR` interno) não seja sobrescrito por outro.
 * - `publicBookable` só é exigido na visão **pública**: a visão staff (token do
 *   próprio estabelecimento) também vê os serviços internos (audiência,
 *   diligência, despacho).
 * - Na visão **pública** só entram serviços **ativos**: desativar é a forma de
 *   "remover" um serviço da agenda do cliente. A visão **staff** continua
 *   listando os inativos — é lá que o dono acompanha o histórico do catálogo.
 * - `active` explícito na query continua valendo nos dois escopos (filtro
 *   pedido pelo chamador).
 */
export function buildServiceListWhere(
  barbershopId: string,
  query: IServiceListFilters,
  options?: { includeInternal?: boolean },
): Prisma.ServiceWhereInput {
  const and: Prisma.ServiceWhereInput[] = [];

  if (!options?.includeInternal) {
    and.push({ publicBookable: true });
    and.push({ active: true });
  }

  if (query.search) {
    and.push({ name: { contains: query.search, mode: "insensitive" } });
  }

  if (query.categoryId) {
    and.push({ categoryId: query.categoryId });
  }

  if (typeof query.active === "boolean") {
    and.push({ active: query.active });
  }

  return {
    barbershopId,
    ...(and.length > 0 ? { AND: and } : {}),
  };
}

/**
 * `orderBy` da listagem de serviços.
 *
 * - `nome` => `{ name: dir }`
 * - `preco` => `{ price: dir }`
 * - `duracao` => `{ avgTimeMinutes: dir }`
 * - `criado` => `{ createdAt: dir }`
 * - `id` sempre por último, como desempate estável para a paginação.
 *
 * Sem `sort`, o resultado é o ordenamento atual: `name` asc, `id` asc.
 */
export function buildServiceListOrderBy(
  sort?: SortInput,
): Prisma.ServiceOrderByWithRelationInput[] {
  const dir = sort?.dir ?? "asc";

  switch (sort?.field) {
    case "preco":
      return [{ price: dir }, { id: dir }];
    case "duracao":
      return [{ avgTimeMinutes: dir }, { id: dir }];
    case "criado":
      return [{ createdAt: dir }, { id: dir }];
    case "nome":
      return [{ name: dir }, { id: dir }];
    default:
      return [{ name: "asc" }, { id: "asc" }];
  }
}
