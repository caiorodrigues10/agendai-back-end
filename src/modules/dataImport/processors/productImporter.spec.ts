import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppTx } from "@/libs/prismaClient";

const {
  productFindFirst,
  productFindMany,
  productCreate,
  productUpdate,
  productCategoryFindMany,
  productCategoryCreate,
  stockMovementCreate,
  txMock,
} = vi.hoisted(() => {
  const productFindFirst = vi.fn();
  const productFindMany = vi.fn();
  const productCreate = vi.fn();
  const productUpdate = vi.fn();
  const productCategoryFindMany = vi.fn();
  const productCategoryCreate = vi.fn();
  const stockMovementCreate = vi.fn();

  return {
    productFindFirst,
    productFindMany,
    productCreate,
    productUpdate,
    productCategoryFindMany,
    productCategoryCreate,
    stockMovementCreate,
    txMock: {
      product: {
        findFirst: productFindFirst,
        findMany: productFindMany,
        create: productCreate,
        update: productUpdate,
      },
      productCategory: {
        findMany: productCategoryFindMany,
        create: productCategoryCreate,
      },
      stockMovement: { create: stockMovementCreate },
    },
  };
});

import { importProductRow, resolveProductType, resolveUnit } from "./productImporter";
import type { ImportRowContext } from "./importRowContext";
import type { ImportFieldKey } from "../dataImport.types";

const SHOP = "shop-1";
const tx = txMock as unknown as AppTx;

function contexto(
  headers: string[],
  columnMap: Array<[string, number]>,
  overrides: Partial<ImportRowContext> = {},
): ImportRowContext {
  return {
    headers,
    columnMap: new Map(columnMap as Array<[ImportFieldKey, number]>),
    options: {
      updateExisting: true,
      countFinancialValues: false,
      sendReviewInvitations: false,
      includeCase: false,
      replaceExistingSchedules: false,
      importTimeOffAsPending: false,
      updateExistingProducts: false,
      createProductCategories: false,
      sendFiadoReminders: false,
    },
    segment: null,
    actingUserId: "user-1",
    batchId: "batch-1",
    ...overrides,
  };
}

const MAPA_PRODUTO: Array<[string, number]> = [
  ["productName", 0],
  ["productSku", 1],
  ["salePrice", 2],
  ["stockQty", 3],
  ["productCategory", 4],
];

const CABECALHO_PRODUTO = ["Produto", "SKU", "Preço", "Estoque", "Categoria"];

describe("importação de produtos", () => {
  beforeEach(() => {
    productFindFirst.mockReset().mockResolvedValue(null);
    productFindMany.mockReset().mockResolvedValue([]);
    productCreate.mockReset().mockResolvedValue({
      id: "prod-1",
      stockQty: 0,
      averageCost: 0,
    });
    productUpdate.mockReset().mockResolvedValue({
      id: "prod-1",
      salePrice: 39.9,
      minStock: 0,
      stockQty: 0,
      averageCost: 0,
    });
    productCategoryFindMany.mockReset().mockResolvedValue([]);
    productCategoryCreate.mockReset().mockResolvedValue({ id: "cat-1" });
    stockMovementCreate.mockReset().mockResolvedValue({ id: "mov-1" });
  });

  it("cria o produto e grava o saldo inicial como movimento de importação", async () => {
    const result = await importProductRow(
      tx,
      SHOP,
      { Produto: "Shampoo", SKU: "SH-1", Preço: "39,90", Estoque: "10", Categoria: "" },
      contexto(CABECALHO_PRODUTO, MAPA_PRODUTO),
    );

    expect(result.status).toBe("IMPORTED");
    expect(result.entityType).toBe("PRODUCT");
    expect(productCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          barbershopId: SHOP,
          name: "Shampoo",
          sku: "SH-1",
          salePrice: 39.9,
          stockQty: 0,
        }),
      }),
    );
    // O saldo inicial é movimento de estoque — não é compra e não é caixa.
    expect(stockMovementCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "IMPORT",
          quantity: 10,
          sourceType: "data_import",
          sourceId: "batch-1",
          createdById: "user-1",
        }),
      }),
    );
    expect(productUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ stockQty: 10 }),
      }),
    );
  });

  it("ignora a coluna de imagem e avisa", async () => {
    const result = await importProductRow(
      tx,
      SHOP,
      { Produto: "Shampoo", SKU: "SH-1", Preço: "39,90", Estoque: "10", Imagem: "https://x/y.png" },
      contexto(
        [...CABECALHO_PRODUTO, "Imagem"],
        [...MAPA_PRODUTO, ["productImage", 5]],
      ),
    );

    expect(result.warnings?.some((warning) => /imagem/i.test(warning))).toBe(true);
  });

  it("ignora produto repetido quando a opção de atualizar está desligada", async () => {
    productFindFirst.mockResolvedValue({
      id: "prod-9",
      salePrice: 30,
      minStock: 0,
      stockQty: 2,
      averageCost: 10,
    });

    const result = await importProductRow(
      tx,
      SHOP,
      { Produto: "Shampoo", SKU: "SH-1", Preço: "39,90", Estoque: "10", Categoria: "" },
      contexto(CABECALHO_PRODUTO, MAPA_PRODUTO),
    );

    expect(result.status).toBe("SKIPPED");
    expect(productUpdate).not.toHaveBeenCalled();
  });

  it("atualiza preço e estoque mínimo e guarda o valor anterior para o desfazer", async () => {
    productFindFirst.mockResolvedValue({
      id: "prod-9",
      salePrice: 30,
      minStock: 1,
      stockQty: 2,
      averageCost: 10,
    });

    const result = await importProductRow(
      tx,
      SHOP,
      { Produto: "Shampoo", SKU: "SH-1", Preço: "39,90", Estoque: "", Categoria: "" },
      contexto(CABECALHO_PRODUTO, MAPA_PRODUTO, {
        options: {
          updateExisting: true,
          countFinancialValues: false,
          sendReviewInvitations: false,
          includeCase: false,
          replaceExistingSchedules: false,
          importTimeOffAsPending: false,
          updateExistingProducts: true,
          createProductCategories: false,
          sendFiadoReminders: false,
        },
      }),
    );

    expect(result.status).toBe("IMPORTED");
    expect(result.previousState?.before).toEqual({
      salePrice: 30,
      minStock: 1,
      stockQty: 2,
      averageCost: 10,
    });
  });

  it("cria a categoria quando a opção está ligada", async () => {
    const result = await importProductRow(
      tx,
      SHOP,
      { Produto: "Shampoo", SKU: "SH-1", Preço: "39,90", Estoque: "", Categoria: "Cuidados" },
      contexto(CABECALHO_PRODUTO, MAPA_PRODUTO, {
        options: {
          updateExisting: true,
          countFinancialValues: false,
          sendReviewInvitations: false,
          includeCase: false,
          replaceExistingSchedules: false,
          importTimeOffAsPending: false,
          updateExistingProducts: false,
          createProductCategories: true,
          sendFiadoReminders: false,
        },
      }),
    );

    expect(productCategoryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ barbershopId: SHOP, name: "Cuidados" }),
      }),
    );
    expect(result.createdCategoryId).toBe("cat-1");
  });

  it("deixa o produto sem categoria e avisa quando a opção está desligada", async () => {
    const result = await importProductRow(
      tx,
      SHOP,
      { Produto: "Shampoo", SKU: "SH-1", Preço: "39,90", Estoque: "", Categoria: "Cuidados" },
      contexto(CABECALHO_PRODUTO, MAPA_PRODUTO),
    );

    expect(productCategoryCreate).not.toHaveBeenCalled();
    expect(result.warnings?.some((warning) => /categoria/i.test(warning))).toBe(true);
  });

  it("rejeita quantidade de estoque inválida", async () => {
    const result = await importProductRow(
      tx,
      SHOP,
      { Produto: "Shampoo", SKU: "SH-1", Preço: "39,90", Estoque: "abc", Categoria: "" },
      contexto(CABECALHO_PRODUTO, MAPA_PRODUTO),
    );

    expect(result.status).toBe("FAILED");
    expect(result.field).toBe("stockQty");
  });

  it("resolve unidade e tipo do produto", () => {
    expect(resolveUnit("Unidade")).toBe("UNIT");
    expect(resolveUnit("Litro")).toBe("L");
    expect(resolveUnit("Caixa")).toBe("BOX");
    expect(resolveUnit("")).toBe("OTHER");
    expect(resolveProductType("Consumo")).toBe("CONSUMABLE");
    expect(resolveProductType("Venda")).toBe("RETAIL");
  });
});
