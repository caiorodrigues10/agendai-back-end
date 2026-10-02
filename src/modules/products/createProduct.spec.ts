/// <reference types="vitest/globals" />

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  productCreate: vi.fn(),
  productFindFirst: vi.fn(),
  productCategoryFindFirst: vi.fn(),
  stockMovementCreate: vi.fn(),
  userFindUnique: vi.fn(),
}));

vi.mock("@/libs/prismaClient", async () => {
  const real = await vi.importActual<typeof import("@prisma/client")>("@prisma/client");
  return {
    Prisma: real.Prisma,
    prisma: {
      $transaction: mocks.transaction,
      product: { create: mocks.productCreate, findFirst: mocks.productFindFirst },
      productCategory: { findFirst: mocks.productCategoryFindFirst },
      stockMovement: { create: mocks.stockMovementCreate },
      user: { findUnique: mocks.userFindUnique },
    },
  };
});

import { ProductCatalogUseCase } from "./useCases/productUseCases";
import { createProductSchema, updateProductSchema } from "./schemas/productSchemas";
import type { InventoryEngine } from "./infra/InventoryEngine";
import type { IStorageProvider } from "@/shared/container/providers/StorageProvider/IStorageProvider";

const SHOP = "00000000-0000-0000-0000-000000000001";
const PRODUCT = "00000000-0000-0000-0000-000000000002";
const OWNER = { id: "owner-1", role: "OWNER", barbershopId: SHOP };

const tx = {
  product: { create: mocks.productCreate },
  stockMovement: { create: mocks.stockMovementCreate },
};

function makeUseCase() {
  return new ProductCatalogUseCase(
    {} as unknown as InventoryEngine,
    {} as unknown as IStorageProvider,
  );
}

function createdData() {
  return (mocks.productCreate.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data;
}

function movementData() {
  return (mocks.stockMovementCreate.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.transaction.mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx));
  mocks.productCreate.mockResolvedValue({ id: PRODUCT, name: "Shampoo hidratante", stockQty: 0 });
  mocks.stockMovementCreate.mockResolvedValue({ id: "mov-1" });
  mocks.productFindFirst.mockResolvedValue(null);
  mocks.productCategoryFindFirst.mockResolvedValue(null);
  mocks.userFindUnique.mockResolvedValue({ permissions: [] });
});

describe("ProductCatalogUseCase.createProduct — estoque inicial", () => {
  it("cria produto com estoque inicial e registra a movimentação de origem", async () => {
    const result = await makeUseCase().createProduct(SHOP, OWNER, {
      name: "Shampoo hidratante",
      salePrice: 10,
      trackStock: true,
      initialStock: 10,
    } as never);

    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    const data = createdData();
    expect(data.stockQty).toBe(10);
    expect(data.averageCost).toBe(0);
    expect(data).not.toHaveProperty("initialStock");

    expect(mocks.stockMovementCreate).toHaveBeenCalledTimes(1);
    expect(movementData()).toEqual({
      barbershopId: SHOP,
      productId: PRODUCT,
      type: "MANUAL_ADJUSTMENT",
      quantity: 10,
      unitCost: 0,
      stockBefore: 0,
      stockAfter: 10,
      sourceType: "initial_stock",
      sourceId: PRODUCT,
      reason: "Estoque inicial no cadastro",
      createdById: OWNER.id,
    });
    expect(result).toMatchObject({ id: PRODUCT });
  });

  it("nasce zerado e sem movimentação quando não informa estoque inicial", async () => {
    await makeUseCase().createProduct(SHOP, OWNER, {
      name: "Pomada modeladora",
      salePrice: 25,
      trackStock: true,
    } as never);

    expect(createdData().stockQty).toBe(0);
    expect(mocks.stockMovementCreate).not.toHaveBeenCalled();
  });

  it("nasce zerado quando o estoque inicial é 0", async () => {
    await makeUseCase().createProduct(SHOP, OWNER, {
      name: "Pomada modeladora",
      salePrice: 25,
      trackStock: true,
      initialStock: 0,
    } as never);

    expect(createdData().stockQty).toBe(0);
    expect(mocks.stockMovementCreate).not.toHaveBeenCalled();
  });

  it("ignora estoque inicial quando o produto não controla estoque", async () => {
    await makeUseCase().createProduct(SHOP, OWNER, {
      name: "Aparador de barba",
      salePrice: 30,
      trackStock: false,
      initialStock: 10,
    } as never);

    expect(createdData().stockQty).toBe(0);
    expect(mocks.stockMovementCreate).not.toHaveBeenCalled();
  });
});

describe("createProductSchema — estoque inicial", () => {
  const base = { name: "Shampoo hidratante", salePrice: 10 };

  it("aceita estoque inicial opcional", () => {
    expect(createProductSchema.safeParse({ ...base, initialStock: 10 }).success).toBe(true);
    expect(createProductSchema.safeParse(base).success).toBe(true);
  });

  it("rejeita estoque inicial negativo", () => {
    const parsed = createProductSchema.safeParse({ ...base, initialStock: -1 });
    expect(parsed.success).toBe(false);
    expect(parsed.success === false && parsed.error.issues.some(issue => issue.path.includes("initialStock"))).toBe(true);
  });

  it("ignora estoque inicial na atualização", () => {
    const parsed = updateProductSchema.safeParse({ name: "Shampoo", salePrice: 10, initialStock: 5 });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data).not.toHaveProperty("initialStock");
  });
});
