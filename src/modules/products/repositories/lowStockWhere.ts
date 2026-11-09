import { Prisma } from "@prisma/client";
import { prisma } from "@/libs/prismaClient";
import { LOW_STOCK_RULE } from "../utils/lowStockRule";

/**
 * Definição única de "estoque baixo" (`products`).
 *
 * Regra: produto que **controla estoque** (`trackStock`), com **mínimo
 * configurado** (`minStock > 0`) e **estoque no ou abaixo do mínimo**
 * (`stockQty <= minStock`), **do salão** informado.
 *
 * A comparação é **coluna × coluna** (`stockQty` contra `minStock`) — por isso
 * o Prisma precisa da *field reference* (`prisma.product.fields.minStock`) e o
 * SQL equivalente (`lowStockSql`).
 *
 * `active` **não** faz parte da definição: quem decide se produto inativo entra
 * no recorte é o chamador (o dashboard e o financeiro filtram `active = true`;
 * a listagem filtra só quando a query pede).
 *
 * A regra vem de `LOW_STOCK_RULE` (`utils/lowStockRule.ts`), que é também a
 * forma em memória usada por dashboard, atenção e bot do dono
 * (`isLowStock`) — assim as três formas não podem divergir.
 *
 * Estas funções são **puras**: não executam nenhuma consulta — elas só montam
 * o `where`/o SQL. A *field reference* vem do cliente Prisma (importado do
 * módulo), que não abre conexão no import.
 */
export function lowStockWhere(barbershopId: string): Prisma.ProductWhereInput {
  return {
    barbershopId,
    trackStock: LOW_STOCK_RULE.trackStock,
    minStock: { gt: LOW_STOCK_RULE.minStockGreaterThan },
    stockQty: { lte: prisma.product.fields.minStock },
  };
}

/**
 * Condições da definição **sem o salão** — para agregações que agrupam por
 * salão (o painel do admin conta os salões todos de uma vez).
 */
export function lowStockConditionsSql(): Prisma.Sql {
  return Prisma.sql`"trackStock" = ${LOW_STOCK_RULE.trackStock}::boolean
    AND "minStock" > ${LOW_STOCK_RULE.minStockGreaterThan}::float8
    AND "stockQty" <= "minStock"`;
}

/**
 * Versão SQL da mesma definição, com o salão, para agregações e para os
 * pontos que já usavam `$queryRaw` (contagens, `COUNT(*) FILTER`).
 *
 * Mantém as mesmas condições da `lowStockWhere`: salão, `trackStock`,
 * `minStock > 0` e `stockQty <= minStock`.
 */
export function lowStockSql(barbershopId: string): Prisma.Sql {
  return Prisma.sql`"barbershopId" = ${barbershopId}::uuid
    AND ${lowStockConditionsSql()}`;
}
