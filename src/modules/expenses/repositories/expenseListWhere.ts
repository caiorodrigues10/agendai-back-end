import type { Prisma } from "@prisma/client";
import { civilDayBounds } from "@/shared/utils/dateUtils";
import type { SortInput } from "@/shared/utils/pagination";
import type { IExpenseListQuery } from "../dtos/IExpenseDTO";

/**
 * Monta o `where` da listagem de despesas.
 *
 * Regras:
 * - `barbershopId` vem SEMPRE do contexto (primeiro argumento) e nunca de um
 *   filtro da query — nenhum parâmetro aceito aqui consegue trocar o salão.
 * - Cada filtro vira uma cláusula própria dentro de `AND`, para que o filtro
 *   de busca (que usa `OR` interno) não seja sobrescrito por outro.
 * - `from`/`to` filtram `referenceDate` com limites do **dia civil do salão**
 *   (`civilDayBounds` com o fuso do salão): o início é inclusivo (meia-noite
 *   local do dia) e o fim é **exclusivo** (meia-noite local do dia seguinte),
 *   de modo que o último dia do intervalo entra inteiro.
 * - O status de pagamento é **derivado** de `paidAt`/`dueDate`:
 *   `paid` → `paidAt IS NOT NULL`; `pending` → `paidAt IS NULL`;
 *   `overdue` → `paidAt IS NULL AND dueDate < agora` (estrito). O `overdue`
 *   sempre carrega o `paidAt IS NULL`, então nunca vaza despesas pagas.
 *   O filtro legado `paid` (booleano) é convertido nos mesmos casos.
 */
export function buildExpenseListWhere(
  barbershopId: string,
  query: IExpenseListQuery,
  now: Date = new Date(),
): Prisma.ExpenseWhereInput {
  const and: Prisma.ExpenseWhereInput[] = [];

  if (query.categoryId) {
    and.push({ categoryId: query.categoryId });
  }

  if (query.type) {
    and.push({ type: query.type });
  }

  if (query.recurrence) {
    and.push({ recurrence: query.recurrence });
  }

  if (query.paymentMethod) {
    and.push({
      paymentMethod: { equals: query.paymentMethod, mode: "insensitive" },
    });
  }

  // Situação de pagamento: `payment` (novo) + `paid` (legado, booleano).
  const payment = new Set<string>(query.payment ?? []);
  if (query.paid === true) payment.add("paid");
  if (query.paid === false) payment.add("pending");

  if (payment.has("paid")) {
    and.push({ paidAt: { not: null } });
  }
  if (payment.has("pending")) {
    and.push({ paidAt: null });
  }
  if (payment.has("overdue")) {
    // Vencida: prazo anterior ao momento da consulta (estrito) e não paga.
    and.push({ paidAt: null });
    and.push({ dueDate: { lt: now } });
  }

  if (query.from || query.to) {
    and.push({
      referenceDate: {
        ...(query.from ? { gte: civilDayBounds(query.from, query.timeZone).gte } : {}),
        ...(query.to ? { lt: civilDayBounds(query.to, query.timeZone).lt } : {}),
      },
    });
  }

  if (query.search) {
    and.push({
      OR: [
        { title: { contains: query.search, mode: "insensitive" } },
        { supplierName: { contains: query.search, mode: "insensitive" } },
        { notes: { contains: query.search, mode: "insensitive" } },
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
 * - `referenceDate` → `{ referenceDate: dir }`
 * - `amount` → `{ amount: dir }`
 * - `dueDate` → `{ dueDate: { sort: dir, nulls: "last" } }` — despesas sem
 *   vencimento ficam **por último nas duas direções**
 * - `createdAt` → `{ createdAt: dir }`
 * - `id` sempre por último, como desempate estável para a paginação, na mesma
 *   direção do campo principal.
 *
 * Sem `sort`, o resultado é o ordenamento atual: `referenceDate` desc, `id`
 * desc.
 */
export function buildExpenseOrderBy(
  sort?: SortInput,
): Prisma.ExpenseOrderByWithRelationInput[] {
  const dir = sort?.dir ?? "desc";

  switch (sort?.field) {
    case "amount":
      return [{ amount: dir }, { id: dir }];
    case "dueDate":
      return [{ dueDate: { sort: dir, nulls: "last" } }, { id: dir }];
    case "createdAt":
      return [{ createdAt: dir }, { id: dir }];
    case "referenceDate":
    default:
      return [{ referenceDate: dir }, { id: dir }];
  }
}
