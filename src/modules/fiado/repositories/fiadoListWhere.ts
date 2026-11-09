import type { Prisma } from "@prisma/client";
import { civilDayBounds } from "@/shared/utils/dateUtils";
import type { SortInput } from "@/shared/utils/pagination";
import type { IFiadoListQuery } from "../dtos/IFiadoDTO";

/** Status que ainda representam dívida em aberto (base do filtro `overdue`). */
export const OPEN_FIADO_STATUSES = ["PENDING", "PARTIAL"] as const;

/**
 * Monta o `where` da listagem de fiados.
 *
 * Regras:
 * - `barbershopId` vem SEMPRE do contexto (primeiro argumento) e nunca de um
 *   filtro da query — nenhum parâmetro aceito aqui consegue trocar o salão.
 * - Cada filtro vira uma cláusula própria dentro de `AND`, para que o filtro
 *   de busca (que usa `OR` interno) não seja sobrescrito por outro e para que
 *   `from/to` (em `createdAt`) e `dueFrom/dueTo` (em `dueDate`) possam ser
 *   combinados sem conflito.
 * - `from`/`to` filtram `createdAt`; `dueFrom`/`dueTo` filtram `dueDate`.
 *   Os dois pares usam dias civis com limites do **fuso do salão**
 *   (`civilDayBounds`): o início é inclusivo (meia-noite local do dia) e o
 *   fim é **exclusivo** (meia-noite local do dia seguinte), de modo que o
 *   último dia do intervalo entra inteiro.
 * - `overdue=true` exige **sempre** status em `PENDING`/`PARTIAL` e
 *   `dueDate` anterior ao momento da consulta, mesmo que `status` venha no
 *   query — as duas cláusulas ficam em `AND`, então o resultado é a interseção
 *   entre o status pedido e os status em aberto. Um status totalmente
 *   incompatível (`PAID`/`FORGIVEN` sozinho) é rejeitado com 400 no schema.
 */
export function buildFiadoListWhere(
  barbershopId: string,
  query: IFiadoListQuery,
  now: Date = new Date(),
): Prisma.FiadoWhereInput {
  const and: Prisma.FiadoWhereInput[] = [];

  if (query.status && query.status.length > 0) {
    and.push({ status: { in: query.status } });
  }

  if (query.clientId) {
    and.push({ clientId: query.clientId });
  }

  if (query.from || query.to) {
    and.push({
      createdAt: {
        ...(query.from ? { gte: civilDayBounds(query.from, query.timeZone).gte } : {}),
        ...(query.to ? { lt: civilDayBounds(query.to, query.timeZone).lt } : {}),
      },
    });
  }

  if (query.dueFrom || query.dueTo) {
    and.push({
      dueDate: {
        ...(query.dueFrom
          ? { gte: civilDayBounds(query.dueFrom, query.timeZone).gte }
          : {}),
        ...(query.dueTo
          ? { lt: civilDayBounds(query.dueTo, query.timeZone).lt }
          : {}),
      },
    });
  }

  if (query.overdue === true) {
    // Vencido: prazo anterior ao momento da consulta (estrito).
    and.push({ dueDate: { lt: now } });
    // Em aberto: `PENDING`/`PARTIAL`, independentemente do status pedido.
    and.push({ status: { in: [...OPEN_FIADO_STATUSES] } });
  }

  if (query.search) {
    and.push({
      OR: [
        { customerName: { contains: query.search, mode: "insensitive" } },
        { whatsapp: { contains: query.search } },
      ],
    });
  }

  return {
    barbershopId,
    ...(and.length > 0 ? { AND: and } : {}),
  };
}

/**
 * `orderBy` da listagem.
 *
 * - `createdAt` => `{ createdAt: dir }`
 * - `dueDate` => `{ dueDate: { sort: dir, nulls: "last" } }` — fiados sem
 *   vencimento ficam **por último nas duas direções**
 * - `amount` => `{ originalAmount: dir }` (coluna real do valor cobrado)
 * - `id` sempre por último, como desempate estável para a paginação, na mesma
 *   direção do campo principal.
 *
 * Sem `sort`, o resultado é o ordenamento atual: `createdAt` desc, `id` desc.
 */
export function buildFiadoOrderBy(
  sort?: SortInput,
): Prisma.FiadoOrderByWithRelationInput[] {
  const dir = sort?.dir ?? "desc";

  switch (sort?.field) {
    case "dueDate":
      return [{ dueDate: { sort: dir, nulls: "last" } }, { id: dir }];
    case "amount":
      return [{ originalAmount: dir }, { id: dir }];
    case "createdAt":
    default:
      return [{ createdAt: dir }, { id: dir }];
  }
}
