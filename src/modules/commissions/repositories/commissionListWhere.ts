import type { Prisma } from "@prisma/client";
import { civilDayBounds } from "@/shared/utils/dateUtils";
import type { SortInput } from "@/shared/utils/pagination";
import type { ICommissionFilters } from "../dtos/ICommissionDTO";

/**
 * Monta o `where` da listagem de comissões.
 *
 * Regras:
 * - `barbershopId` vem SEMPRE do contexto (primeiro argumento) e nunca de um
 *   filtro da query — nenhum parâmetro aceito aqui consegue trocar o salão.
 *   `professionalId`/`serviceId` de outro salão combinados com o salão do
 *   contexto resultam em consulta vazia (não vazam dados alheios).
 * - Cada filtro vira uma cláusula própria dentro de `AND`.
 * - `from`/`to` filtram `createdAt` (a coluna é `DateTime`/timestamp, não
 *   `@db.Date`) com limites do **dia civil do salão** (`civilDayBounds` com o
 *   fuso): `from` inclusivo (meia-noite local) e `to` exclusivo na meia-noite
 *   local do dia seguinte, de modo que o último dia entra inteiro.
 * - Sem filtro de status: `CommissionEntry` não tem status.
 */
export function buildCommissionListWhere(
  barbershopId: string,
  query: ICommissionFilters,
): Prisma.CommissionEntryWhereInput {
  const and: Prisma.CommissionEntryWhereInput[] = [];

  if (query.professionalId) {
    and.push({ professionalId: query.professionalId });
  }

  if (query.serviceId) {
    and.push({ serviceId: query.serviceId });
  }

  if (query.origin === "QUEUE") {
    and.push({ queueItemId: { not: null } });
  }
  if (query.origin === "APPOINTMENT") {
    and.push({ appointmentId: { not: null } });
  }

  if (query.from || query.to) {
    and.push({
      createdAt: {
        ...(query.from
          ? { gte: civilDayBounds(query.from, query.timeZone).gte }
          : {}),
        ...(query.to ? { lt: civilDayBounds(query.to, query.timeZone).lt } : {}),
      },
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
 * - `data` → `{ createdAt: dir }`
 * - `valor` → `{ amount: dir }`
 * - `id` sempre por último, como desempate estável para a paginação, na mesma
 *   direção do campo principal.
 *
 * Sem `sort`, o resultado é o ordenamento atual: `createdAt` desc, `id` desc.
 */
export function buildCommissionOrderBy(
  sort?: SortInput,
): Prisma.CommissionEntryOrderByWithRelationInput[] {
  const dir = sort?.dir ?? "desc";

  switch (sort?.field) {
    case "valor":
      return [{ amount: dir }, { id: dir }];
    case "data":
    default:
      return [{ createdAt: dir }, { id: dir }];
  }
}
