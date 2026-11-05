import { describe, expect, it, vi } from "vitest";

/**
 * A *field reference* precisa do cliente Prisma. O mock entrega um marcador
 * único para o `minStock`, para o spec poder comparar a forma do `where` sem
 * depender do motor de query.
 */
const { fieldRef } = vi.hoisted(() => ({
  fieldRef: { __campo: "minStock" },
}));

vi.mock("@/libs/prismaClient", () => ({
  prisma: {
    product: {
      fields: {
        minStock: fieldRef,
      },
    },
  },
}));

import { lowStockSql, lowStockWhere } from "./lowStockWhere";

const SHOP = "11111111-1111-4111-8111-111111111111";

describe("lowStockWhere (definição única de estoque baixo)", () => {
  it("monta a regra: salão + trackStock + minStock > 0 + stockQty <= minStock", () => {
    expect(lowStockWhere(SHOP)).toEqual({
      barbershopId: SHOP,
      trackStock: true,
      minStock: { gt: 0 },
      stockQty: { lte: fieldRef },
    });
  });

  it("o salão vem do contexto: nenhum filtro troca o salão", () => {
    expect(lowStockWhere(SHOP).barbershopId).toBe(SHOP);
  });

  it("não filtra por active (decisão do chamador)", () => {
    expect(lowStockWhere(SHOP)).not.toHaveProperty("active");
  });
});

describe("lowStockSql (mesma definição em SQL)", () => {
  it("traz as mesmas quatro condições da versão Prisma", () => {
    const sql = lowStockSql(SHOP);

    expect(sql.text).toContain('"barbershopId" =');
    expect(sql.text).toContain('"trackStock" = true');
    expect(sql.text).toContain('"minStock" > 0');
    expect(sql.text).toContain('"stockQty" <= "minStock"');
    expect(sql.values).toEqual([SHOP]);
  });

  it("não filtra por active", () => {
    expect(lowStockSql(SHOP).text).not.toContain('"active"');
  });

  it("as duas versões expressam a mesma regra (mesmo par de condições)", () => {
    const where = lowStockWhere(SHOP);
    const sql = lowStockSql(SHOP).text;

    // Prisma → SQL
    expect(sql).toContain('"barbershopId" =');
    expect(where.barbershopId).toBe(SHOP);

    expect(sql).toContain('"trackStock" = true');
    expect(where.trackStock).toBe(true);

    expect(sql).toContain('"minStock" > 0');
    expect(where.minStock).toEqual({ gt: 0 });

    expect(sql).toContain('"stockQty" <= "minStock"');
    expect(where.stockQty).toEqual({ lte: fieldRef });
  });
});
