import type { Prisma } from "@prisma/client";
import { utcDayBounds } from "@/shared/utils/dateUtils";
import type { ISalonClientListQuery } from "../dtos/ISalonClientDTO";

/** Status de fiado que conta como "em aberto". */
export const OPEN_FIADO_STATUSES = ["PENDING", "PARTIAL"] as const;

/** Limite (em dias) usado para calcular a data de corte de `inactiveDays`. */
export const MAX_INACTIVE_DAYS = 3650;

/**
 * Data de corte do filtro "sem visita há N dias": `now - N dias`.
 */
export function inactiveThreshold(inactiveDays: number, now: Date = new Date()): Date {
  return new Date(now.getTime() - inactiveDays * 24 * 60 * 60 * 1000);
}

/**
 * Monta o `where` da listagem de clientes.
 *
 * Regras:
 * - `barbershopId` vem SEMPRE do contexto (primeiro argumento) e nunca de um
 *   filtro da query — nenhum parâmetro aceito aqui consegue trocar o salão.
 * - Cada filtro vira uma cláusula própria dentro de `AND`, para que filtros
 *   com `OR` interno (busca e inatividade) não se sobrescrevam entre si.
 *
 * `inactiveDays`: cliente sem visita há N dias é quem tem `lastVisitAt`
 * anterior ao limite; quem nunca visitou (`lastVisitAt` nulo) usa `createdAt`
 * anterior ao limite.
 *
 * `hasOpenFiado`: usa a relação `Fiado.clientId` — um fiado sem `clientId`
 * não está ligado a nenhum cliente e, portanto, nunca entra no filtro.
 * O `barbershopId` é repetido dentro do `some` para que um fiado de outro
 * salão (vinculado por engano a este cliente) não o marque como "em aberto".
 *
 * `hasActivePackage`: usa a relação `ClientPackage` com `status = ACTIVE`,
 * exatamente o mesmo critério do campo `activePackageCount` devolvido na
 * própria listagem.
 */
export function buildSalonClientListWhere(
  query: ISalonClientListQuery,
  barbershopId: string,
  now: Date = new Date(),
): Prisma.SalonClientWhereInput {
  const and: Prisma.SalonClientWhereInput[] = [];

  if (query.search) {
    const digits = query.search.replace(/\D/g, "");
    and.push({
      OR: [
        { name: { contains: query.search, mode: "insensitive" } },
        ...(digits ? [{ whatsapp: { contains: digits } }] : []),
      ],
    });
  }

  if (query.createdFrom || query.createdTo) {
    and.push({
      createdAt: {
        ...(query.createdFrom ? { gte: utcDayBounds(query.createdFrom).gte } : {}),
        ...(query.createdTo ? { lt: utcDayBounds(query.createdTo).lt } : {}),
      },
    });
  }

  if (query.inactiveDays !== undefined) {
    const threshold = inactiveThreshold(query.inactiveDays, now);
    and.push({
      OR: [
        { lastVisitAt: { lt: threshold } },
        { AND: [{ lastVisitAt: null }, { createdAt: { lt: threshold } }] },
      ],
    });
  }

  if (query.hasOpenFiado !== undefined) {
    const openFiado: Prisma.FiadoWhereInput = {
      barbershopId,
      status: { in: [...OPEN_FIADO_STATUSES] },
    };
    and.push(
      query.hasOpenFiado
        ? { fiados: { some: openFiado } }
        : { fiados: { none: openFiado } },
    );
  }

  if (query.hasActivePackage !== undefined) {
    const activePackage: Prisma.ClientPackageWhereInput = { status: "ACTIVE" };
    and.push(
      query.hasActivePackage
        ? { packages: { some: activePackage } }
        : { packages: { none: activePackage } },
    );
  }

  return {
    barbershopId,
    ...(and.length > 0 ? { AND: and } : {}),
  };
}

/**
 * `orderBy` da listagem: campo escolhido (whitelist) + `id` como
 * desempate, para que a paginação continue determinística.
 */
export function buildSalonClientOrderBy(
  sort: ISalonClientListQuery["sort"],
): Prisma.SalonClientOrderByWithRelationInput[] {
  const field = sort?.field ?? "name";
  const dir = sort?.dir ?? "asc";

  return [{ [field]: dir } as Prisma.SalonClientOrderByWithRelationInput, { id: "asc" }];
}
