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

import {
  lowStockConditionsSql,
  lowStockSql,
  lowStockWhere,
} from "./lowStockWhere";
import { isLowStock } from "../utils/lowStockRule";

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
    expect(sql.text).toContain('"trackStock" =');
    expect(sql.text).toContain('"minStock" >');
    expect(sql.text).toContain('"stockQty" <= "minStock"');
    expect(sql.values).toEqual([SHOP, true, 0]);
  });

  it("não filtra por active", () => {
    expect(lowStockSql(SHOP).text).not.toContain('"active"');
  });

  it("as condições sem salão são as mesmas (para o contador por salão do admin)", () => {
    const sql = lowStockConditionsSql();

    expect(sql.text).toContain('"trackStock" =');
    expect(sql.text).toContain('"minStock" >');
    expect(sql.text).toContain('"stockQty" <= "minStock"');
    expect(sql.text).not.toContain('"barbershopId"');
    expect(sql.values).toEqual([true, 0]);
  });
});

describe("as três formas expressam a mesma regra", () => {
  it("Prisma, SQL e predicado em memória concordam", () => {
    const where = lowStockWhere(SHOP);
    const sql = lowStockSql(SHOP).text;

    // Prisma → SQL
    expect(sql).toContain('"barbershopId" =');
    expect(where.barbershopId).toBe(SHOP);

    expect(sql).toContain('"trackStock" =');
    expect(where.trackStock).toBe(true);

    expect(sql).toContain('"minStock" >');
    expect(where.minStock).toEqual({ gt: 0 });

    expect(sql).toContain('"stockQty" <= "minStock"');
    expect(where.stockQty).toEqual({ lte: fieldRef });
  });

  it("o predicado em memória aceita e rejeita os mesmos casos da definição", () => {
    // dentro da regra
    expect(isLowStock({ trackStock: true, minStock: 5, stockQty: 2 })).toBe(true);
    expect(isLowStock({ trackStock: true, minStock: 5, stockQty: 5 })).toBe(true);
    expect(isLowStock({ trackStock: true, minStock: 5, stockQty: 0 })).toBe(true);

    // fora da regra
    expect(isLowStock({ trackStock: false, minStock: 5, stockQty: 2 })).toBe(false);
    expect(isLowStock({ trackStock: true, minStock: 0, stockQty: 0 })).toBe(false);
    expect(isLowStock({ trackStock: true, minStock: 5, stockQty: 6 })).toBe(false);
  });
});
