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
