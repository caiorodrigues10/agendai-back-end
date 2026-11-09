import { describe, expect, it, vi } from "vitest";

/**
 * O engine chama o Prisma real (mockado aqui). O `product.findMany` é o único
 * mock com comportamento: ele **aplica o `where` recebido** sobre a fixture,
 * como o banco faria — inclusive resolvendo a *field reference* de
 * `stockQty <= minStock` contra a própria coluna `minStock` da linha.
 */
type Linha = {
  id: string;
  name: string;
  sku: string | null;
  stockQty: number;
  minStock: number;
  trackStock: boolean;
  active: boolean;
  barbershopId: string;
};

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    appointment: {
      findMany: vi.fn(async () => []),
      aggregate: vi.fn(async () => ({ _sum: {} })),
      count: vi.fn(async () => 0),
    },
    schedule: { findMany: vi.fn(async () => []) },
    salonClient: { findMany: vi.fn(async () => []) },
    product: {
      findMany: vi.fn<(args: { where: Record<string, any> }) => Promise<Linha[]>>(async () => []),
      fields: { minStock: { __fieldRef: "minStock" } },
    },
    professionalGoal: { findMany: vi.fn(async () => []) },
    dismissedRecommendation: { findMany: vi.fn(async () => []) },
  },
}));

vi.mock("@/libs/prismaClient", () => ({ prisma: prismaMock }));

import { RecommendationEngine } from "./recommendationEngine";
import { lowStockWhere } from "@/modules/products/repositories/lowStockWhere";

const SHOP = "11111111-1111-4111-8111-111111111111";

/** Aplica o `where` da Prisma sobre uma linha (como o banco faria). */
function aplicarWhere(where: Record<string, any>, row: Linha): boolean {
  if (where.barbershopId && row.barbershopId !== where.barbershopId) return false;
  if (where.trackStock !== undefined && row.trackStock !== where.trackStock) return false;
  if (where.active !== undefined && row.active !== where.active) return false;
  if (where.minStock?.gt !== undefined && !(row.minStock > where.minStock.gt)) return false;
  const limite = where.stockQty?.lte;
  if (limite !== undefined) {
    // A *field reference* (`prisma.product.fields.minStock`) compara a coluna
    // `stockQty` com a coluna `minStock` da própria linha.
    const referencia = limite === prismaMock.product.fields.minStock ? row.minStock : limite;
    if (!(row.stockQty <= referencia)) return false;
  }
  return true;
}

function prepararFixture(linhas: Linha[]) {
  prismaMock.product.findMany.mockImplementation(async (args: { where: Record<string, any> }) =>
    linhas.filter((linha) => aplicarWhere(args.where, linha)),
  );
}

describe("RecommendationEngine — recomendação de reposição", () => {
  it("consulta o banco com a definição única de estoque baixo + active: true", async () => {
    prepararFixture([]);
    await new RecommendationEngine(SHOP).generate();

    const chamada = prismaMock.product.findMany.mock.calls[0]?.[0];
    expect(chamada?.where).toEqual({ ...lowStockWhere(SHOP), active: true });
  });

  it("recomenda o produto baixo e ativo", async () => {
    prepararFixture([
      {
        id: "prod-baixo",
        name: "Shampoo QA",
        sku: "SKU-1",
        stockQty: 2,
        minStock: 5,
        trackStock: true,
        active: true,
        barbershopId: SHOP,
      },
    ]);

    const recommendations = await new RecommendationEngine(SHOP).generate();
    const reposicao = recommendations.find((r) => r.id === "product-reorder");

    expect(reposicao).toBeDefined();
    expect(reposicao?.metadata.count).toBe(1);
    expect(
      (reposicao?.metadata.products as Array<{ id: string }>).map((p) => p.id),
    ).toEqual(["prod-baixo"]);
  });

  it("produto com minStock 0 não gera recomendação de reposição", async () => {
    prepararFixture([
      {
        id: "prod-minimo-zero",
        name: "Condicionador QA",
        sku: null,
        stockQty: 0,
        minStock: 0,
        trackStock: true,
        active: true,
        barbershopId: SHOP,
      },
    ]);

    const recommendations = await new RecommendationEngine(SHOP).generate();

    expect(recommendations.find((r) => r.id === "product-reorder")).toBeUndefined();
  });

  it("produto inativo não gera recomendação de reposição", async () => {
    prepararFixture([
      {
        id: "prod-inativo",
        name: "Pomada QA",
        sku: null,
        stockQty: 1,
        minStock: 5,
        trackStock: true,
        active: false,
        barbershopId: SHOP,
      },
    ]);

    const recommendations = await new RecommendationEngine(SHOP).generate();

    expect(recommendations.find((r) => r.id === "product-reorder")).toBeUndefined();
  });
});
