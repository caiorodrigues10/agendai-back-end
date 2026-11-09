import type { Prisma } from "@prisma/client";
import { utcDayBounds } from "@/shared/utils/dateUtils";
import type { IListAppointmentsQuery } from "../dtos/IAppointmentDTO";

/**
 * Monta o `where` da listagem de agendamentos.
 *
 * Regras:
 * - `barbershopId` vem SEMPRE do contexto (primeiro argumento) e nunca de um
 *   filtro da query — nenhum parâmetro aceito aqui consegue trocar o salão.
 * - Cada filtro vira uma cláusula própria dentro de `AND`, para que o filtro
 *   de busca (que usa `OR` interno) não seja sobrescrito por outro.
 * - `date` tem **precedência** sobre `from`/`to`: quando `date` vem
 *   preenchido, o intervalo civil é ignorado (comportamento já existente).
 */
export function buildAppointmentListWhere(
  barbershopId: string,
  query: IListAppointmentsQuery,
): Prisma.AppointmentWhereInput {
  const and: Prisma.AppointmentWhereInput[] = [];

  if (query.date) {
    // Dia civil: limites UTC do dia (convenção já usada pelo módulo).
    const { gte, lt } = utcDayBounds(query.date);
    and.push({ date: { gte, lt } });
  } else if (query.from || query.to) {
    // Intervalo civil: `from` inclusivo, `to` exclusivo (início do dia seguinte).
    and.push({
      date: {
        ...(query.from ? { gte: utcDayBounds(query.from).gte } : {}),
        ...(query.to ? { lt: utcDayBounds(query.to).lt } : {}),
      },
    });
  }

  if (query.status && query.status.length > 0) {
    and.push({ status: { in: query.status } });
  }
  if (query.staffId) and.push({ staffId: query.staffId });
  if (query.serviceId) and.push({ serviceId: query.serviceId });
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
 * `orderBy` da listagem: data na direção escolhida, horário como segundo
 * critério **na mesma direção** e `id` por último (desempate estável para a
 * paginação).
 *
 * Sem `sort`, o resultado é o ordenamento atual: data, horário e id em ordem
 * crescente.
 */
export function buildAppointmentOrderBy(
  sort: IListAppointmentsQuery["sort"],
): Prisma.AppointmentOrderByWithRelationInput[] {
  const dir = sort?.dir ?? "asc";

  return [{ date: dir }, { time: dir }, { id: "asc" }];
}
