/// <reference types="vitest/globals" />

const mocks = vi.hoisted(() => ({
  productFindFirst: vi.fn(),
  productDeleteMany: vi.fn(),
  userFindUnique: vi.fn(),
  stockMovementCount: vi.fn(),
  receiptItemCount: vi.fn(),
  saleLineCount: vi.fn(),
  refundLineCount: vi.fn(),
  reservationCount: vi.fn(),
}));

vi.mock("@/libs/prismaClient", () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    product: { findFirst: mocks.productFindFirst, deleteMany: mocks.productDeleteMany },
    stockMovement: { count: mocks.stockMovementCount },
    inventoryReceiptItem: { count: mocks.receiptItemCount },
    retailSaleLine: { count: mocks.saleLineCount },
    retailSaleRefundLine: { count: mocks.refundLineCount },
    productReservation: { count: mocks.reservationCount },
  },
}));

import { ProductCatalogUseCase } from "./useCases/productUseCases";
import { AppError } from "@/shared/errors/AppError";
import type { InventoryEngine } from "./infra/InventoryEngine";
import type { IStorageProvider } from "@/shared/container/providers/StorageProvider/IStorageProvider";

const SHOP = "00000000-0000-0000-0000-000000000001";
const PRODUCT = "00000000-0000-0000-0000-000000000002";
const OWNER = { id: "owner-1", role: "OWNER", barbershopId: SHOP };
const EMPLOYEE = { id: "emp-1", role: "EMPLOYEE", barbershopId: SHOP };

function makeUseCase() {
  return new ProductCatalogUseCase(
    {} as unknown as InventoryEngine,
    {} as unknown as IStorageProvider,
  );
}

async function expectAppError(promise: Promise<unknown>, statusCode: number, code?: string) {
  try {
    await promise;
    expect.fail("deveria lançar AppError");
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(statusCode);
    if (code) expect((error as AppError).code).toBe(code);
  }
}

describe("ProductCatalogUseCase.deleteProduct", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.productFindFirst.mockResolvedValue({ id: PRODUCT, barbershopId: SHOP, active: true });
    mocks.productDeleteMany.mockResolvedValue({ count: 1 });
    mocks.userFindUnique.mockResolvedValue({ permissions: [] });
    mocks.stockMovementCount.mockResolvedValue(0);
    mocks.receiptItemCount.mockResolvedValue(0);
    mocks.saleLineCount.mockResolvedValue(0);
    mocks.refundLineCount.mockResolvedValue(0);
    mocks.reservationCount.mockResolvedValue(0);
  });

  it("apaga produto sem histórico e sem reserva aberta", async () => {
    const result = await makeUseCase().deleteProduct(PRODUCT, SHOP, OWNER);

    expect(result).toEqual({ deleted: true });
    expect(mocks.productFindFirst).toHaveBeenCalledWith({ where: { id: PRODUCT, barbershopId: SHOP } });
    expect(mocks.productDeleteMany).toHaveBeenCalledWith({ where: { id: PRODUCT, barbershopId: SHOP } });
    expect(mocks.reservationCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ productId: PRODUCT, status: "RESERVED" }) }),
    );
  });

  it("bloqueia com 409 PRODUCT_HAS_HISTORY quando há movimentação de estoque ou vendas", async () => {
    mocks.saleLineCount.mockResolvedValue(1);

    await expectAppError(
      makeUseCase().deleteProduct(PRODUCT, SHOP, OWNER),
      409,
      "PRODUCT_HAS_HISTORY",
    );
    expect(mocks.productDeleteMany).not.toHaveBeenCalled();
  });

  it("bloqueia com 409 PRODUCT_HAS_OPEN_RESERVATIONS quando há reserva vigente", async () => {
    mocks.reservationCount.mockResolvedValue(2);

    await expectAppError(
      makeUseCase().deleteProduct(PRODUCT, SHOP, OWNER),
      409,
      "PRODUCT_HAS_OPEN_RESERVATIONS",
    );
    expect(mocks.productDeleteMany).not.toHaveBeenCalled();
  });

  it("devolve 404 para produto de outro salão", async () => {
    mocks.productFindFirst.mockResolvedValue(null);

    await expectAppError(makeUseCase().deleteProduct(PRODUCT, SHOP, OWNER), 404);
    expect(mocks.productDeleteMany).not.toHaveBeenCalled();
  });

  it("devolve 403 para funcionário sem PRODUCTS_MANAGE", async () => {
    mocks.userFindUnique.mockResolvedValue({ permissions: ["PRODUCTS_VIEW"] });

    await expectAppError(
      makeUseCase().deleteProduct(PRODUCT, SHOP, EMPLOYEE),
      403,
    );
    expect(mocks.productFindFirst).not.toHaveBeenCalled();
    expect(mocks.productDeleteMany).not.toHaveBeenCalled();
  });
});
