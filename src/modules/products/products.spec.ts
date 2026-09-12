import { describe, expect, it } from "vitest";
import {
  namesToSkip,
  nextStockQty,
  planPurchaseLines,
  planRetailSaleLines,
  remainingFiadoAmount,
  weightedAverageCost,
  type CatalogProductSnapshot,
} from "./inventoryMath";
import { productTypeWhere } from "./productListFilters";
import { buildProductAttention } from "./utils/productAttention";
import { CATALOG_TEMPLATE_VERSION, getCatalogTemplate } from "./catalogTemplates";
import { AppError } from "@/shared/errors/AppError";

const shop = "shop-1";
const product = (over: Partial<CatalogProductSnapshot> = {}): CatalogProductSnapshot => ({
  id: "p1",
  barbershopId: shop,
  name: "Pomada",
  active: true,
  type: "RETAIL",
  trackStock: true,
  stockQty: 2,
  salePrice: 40,
  averageCost: 10,
  ...over,
});

describe("inventoryMath", () => {
  it("calcula custo médio ponderado na entrada", () => {
    expect(weightedAverageCost(2, 10, 2, 20)).toBe(15);
  });

  it("zera custo médio quando o estoque volta a zero na reversão", () => {
    expect(weightedAverageCost(2, 15, -2, 15)).toBe(0);
  });

  it("bloqueia saldo negativo em produto com controle de estoque", () => {
    try {
      nextStockQty(1, -2, true);
      expect.fail("deveria lançar");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).statusCode).toBe(409);
      expect((error as AppError).code).toBe("INSUFFICIENT_STOCK");
    }
  });

  it("permite venda sem controle de estoque", () => {
    const lines = planRetailSaleLines(
      [product({ trackStock: false, stockQty: 0 })],
      [{ productId: "p1", quantity: 3 }],
      { barbershopId: shop, allowPriceOverride: false }
    );
    expect(lines[0].stockAfter).toBe(0);
    expect(lines[0].unitCost).toBe(10);
  });

  it("congela o preço de catálogo quando o funcionário não pode alterar", () => {
    const lines = planRetailSaleLines(
      [product()],
      [{ productId: "p1", quantity: 1, unitPrice: 1 }],
      { barbershopId: shop, allowPriceOverride: false }
    );
    expect(lines[0].unitPrice).toBe(40);
  });

  it("permite override de preço para gestor", () => {
    const lines = planRetailSaleLines(
      [product()],
      [{ productId: "p1", quantity: 1, unitPrice: 35 }],
      { barbershopId: shop, allowPriceOverride: true }
    );
    expect(lines[0].unitPrice).toBe(35);
  });

  it("impede venda de produto inativo", () => {
    expect(() =>
      planRetailSaleLines([product({ active: false })], [{ productId: "p1", quantity: 1 }], {
        barbershopId: shop,
        allowPriceOverride: false,
      })
    ).toThrow(/inativo/);
  });

  it("isola tenant: produto de outro salão não entra na venda", () => {
    expect(() =>
      planRetailSaleLines([product({ barbershopId: "shop-2" })], [{ productId: "p1", quantity: 1 }], {
        barbershopId: shop,
        allowPriceOverride: false,
      })
    ).toThrow(/não encontrado/);
  });

  it("simula concorrência do último item sem saldo negativo", () => {
    const first = planRetailSaleLines([product({ stockQty: 1 })], [{ productId: "p1", quantity: 1 }], {
      barbershopId: shop,
      allowPriceOverride: false,
    });
    expect(first[0].stockAfter).toBe(0);
    expect(() =>
      planRetailSaleLines(
        [product({ stockQty: first[0].stockAfter })],
        [{ productId: "p1", quantity: 1 }],
        { barbershopId: shop, allowPriceOverride: false }
      )
    ).toThrow(/insuficiente/i);
  });

  it("compra atualiza estoque e custo médio", () => {
    const lines = planPurchaseLines(
      [product({ stockQty: 1, averageCost: 10 })],
      [{ productId: "p1", quantity: 1, unitCost: 30 }],
      shop
    );
    expect(lines[0].stockAfter).toBe(2);
    expect(lines[0].averageCostAfter).toBe(20);
  });

  it("saldo de fiado considera ajustes de crédito", () => {
    expect(remainingFiadoAmount(100, 20, 30)).toBe(50);
  });
  it("impede venda de produto CONSUMABLE (uso interno)", () => {
    expect(() =>
      planRetailSaleLines([product({ type: "CONSUMABLE", name: "Tinta" })], [{ productId: "p1", quantity: 1 }], {
        barbershopId: shop,
        allowPriceOverride: false,
      })
    ).toThrow(/uso interno/i);
  });

  it("permite venda de produto BOTH", () => {
    const lines = planRetailSaleLines(
      [product({ type: "BOTH", name: "Shampoo" })],
      [{ productId: "p1", quantity: 1 }],
      { barbershopId: shop, allowPriceOverride: false }
    );
    expect(lines[0].unitPrice).toBe(40);
  });
});

describe("productTypeWhere (list purpose)", () => {
  it("purpose=own devolve CONSUMABLE e BOTH", () => {
    expect(productTypeWhere({ purpose: "own" })).toEqual({ type: { in: ["CONSUMABLE", "BOTH"] } });
  });

  it("purpose=sale e forSale=true devolvem RETAIL e BOTH", () => {
    expect(productTypeWhere({ purpose: "sale" })).toEqual({ type: { in: ["RETAIL", "BOTH"] } });
    expect(productTypeWhere({ forSale: "true" })).toEqual({ type: { in: ["RETAIL", "BOTH"] } });
  });

  it("purpose tem prioridade sobre type exato", () => {
    expect(productTypeWhere({ purpose: "own", type: "RETAIL" })).toEqual({
      type: { in: ["CONSUMABLE", "BOTH"] },
    });
  });

  it("type exato quando não há purpose/forSale", () => {
    expect(productTypeWhere({ type: "CONSUMABLE" })).toEqual({ type: "CONSUMABLE" });
  });
});

describe("buildProductAttention", () => {
  const from = new Date("2026-03-01T00:00:00.000Z");
  const to = new Date("2026-03-31T00:00:00.000Z");

  it("classifica faltando, bombando, repor e parado", () => {
    const products = [
      { id: "a", name: "Pomada", stockQty: 1, minStock: 5, trackStock: true, type: "RETAIL" as const },
      { id: "b", name: "Shampoo", stockQty: 50, minStock: 5, trackStock: true, type: "BOTH" as const },
      { id: "c", name: "Tinta", stockQty: 20, minStock: 2, trackStock: true, type: "CONSUMABLE" as const },
      { id: "d", name: "Gel", stockQty: 2, minStock: 10, trackStock: true, type: "RETAIL" as const },
    ];
    const byProduct = [
      { productId: "a", name: "Pomada", quantity: 40, revenue: 800, cost: 200, margin: 600 },
      { productId: "d", name: "Gel", quantity: 30, revenue: 450, cost: 100, margin: 350 },
      { productId: "b", name: "Shampoo", quantity: 2, revenue: 80, cost: 20, margin: 60 },
    ];
    const attention = buildProductAttention({ products, byProduct, from, to });
    expect(attention.missing.map((p) => p.productId).sort()).toEqual(["a", "d"]);
    expect(attention.hot[0]?.productId).toBe("a");
    expect(attention.needsReorder.some((p) => p.productId === "a")).toBe(true);
    expect(attention.idle.map((p) => p.productId)).toEqual(["c"]);
  });
});

describe("catalog templates", () => {
  it("não sugere nomes já cadastrados", () => {
    const skip = namesToSkip([{ name: "Pomada modeladora" }], getCatalogTemplate("BARBERSHOP").products);
    expect(skip.has("pomada modeladora")).toBe(true);
  });

  it("segunda instalação da mesma versão é identificável pelo par tenant+segmento+versão", () => {
    expect(CATALOG_TEMPLATE_VERSION).toBe("v1");
    expect(getCatalogTemplate("NAIL_STUDIO").products.some((p) => /esmalte/i.test(p.name))).toBe(true);
  });
});
