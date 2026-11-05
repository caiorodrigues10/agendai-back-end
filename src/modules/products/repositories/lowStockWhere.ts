import { Prisma } from "@prisma/client";
import { prisma } from "@/libs/prismaClient";

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
 * Esta função é **pura**: não executa nenhuma consulta — ela só monta o
 * `where`. A *field reference* vem do cliente Prisma (importado do módulo), que
 * não abre conexão no import.
 */
export function lowStockWhere(barbershopId: string): Prisma.ProductWhereInput {
  return {
    barbershopId,
    trackStock: true,
    minStock: { gt: 0 },
    stockQty: { lte: prisma.product.fields.minStock },
  };
}

/**
 * Versão SQL da mesma definição, para agregações e para os pontos que já
 * usavam `$queryRaw` (contagens, `COUNT(*) FILTER`).
 *
 * Mantém as mesmas quatro condições da `lowStockWhere`, na mesma ordem:
 * salão, `trackStock`, `minStock > 0` e `stockQty <= minStock`.
 */
export function lowStockSql(barbershopId: string): Prisma.Sql {
  return Prisma.sql`"barbershopId" = ${barbershopId}::uuid
    AND "trackStock" = true
    AND "minStock" > 0
    AND "stockQty" <= "minStock"`;
}
