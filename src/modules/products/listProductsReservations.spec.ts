/// <reference types="vitest/globals" />

const mocks = vi.hoisted(() => ({
  barbershopFindUnique: vi.fn(),
  productFindMany: vi.fn(),
  productCount: vi.fn(),
  userFindUnique: vi.fn(),
  reservationFindMany: vi.fn(),
  queryRaw: vi.fn(),
}));

vi.mock("@/libs/prismaClient", () => ({
  prisma: {
    barbershop: { findUnique: mocks.barbershopFindUnique },
    product: { findMany: mocks.productFindMany, count: mocks.productCount },
    productReservation: { findMany: mocks.reservationFindMany },
    user: { findUnique: mocks.userFindUnique },
    $queryRaw: mocks.queryRaw,
  },
  Prisma: {
    sql: (strings: readonly string[], ...values: unknown[]) => ({ strings, values }),
    join: (values: unknown[]) => values,
  },
}));

import { ProductCatalogUseCase } from "./useCases/productUseCases";
import type { InventoryEngine } from "./infra/InventoryEngine";
import type { IStorageProvider } from "@/shared/container/providers/StorageProvider/IStorageProvider";

const SHOP = "00000000-0000-0000-0000-000000000001";
const PRODUCT = "00000000-0000-0000-0000-000000000002";
const OWNER = { id: "owner-1", role: "OWNER", barbershopId: SHOP };
const EMPLOYEE = { id: "emp-1", role: "EMPLOYEE", barbershopId: SHOP };

const future = () => new Date(Date.now() + 60 * 60 * 1000);
const past = () => new Date(Date.now() - 60 * 60 * 1000);

function productRow(over: Record<string, unknown> = {}) {
  return {
    id: PRODUCT,
    barbershopId: SHOP,
    name: "Shampoo hidratante",
    description: null,
    sku: null,
    barcode: null,
    imageUrl: null,
    unit: "UNIT",
    unitLabel: "un",
    salePrice: 40,
    averageCost: 10,
    stockQty: 5,
    minStock: 0,
    active: true,
    type: "RETAIL",
    trackStock: true,
    expirationDate: null,
    lotNumber: null,
    category: { id: "cat-1", name: "Cabelo" },
    ...over,
  };
}

function reservationRow(over: Record<string, unknown> = {}) {
  return {
    id: "res-1",
    productId: PRODUCT,
    quantity: 2,
    status: "RESERVED",
    expiresAt: future(),
    createdAt: new Date("2026-10-01T10:00:00.000Z"),
    customerName: "Ana Souza",
    whatsapp: "11988887777",
    ...over,
  };
}

function makeUseCase() {
  return new ProductCatalogUseCase(
    {} as unknown as InventoryEngine,
    {} as unknown as IStorageProvider,
  );
}

const QUERY = { page: 1, limit: 30 };

async function list(user: typeof OWNER, query: Record<string, unknown> = {}) {
  return makeUseCase().listProducts(SHOP, user, { ...QUERY, ...query } as never);
}

describe("ProductCatalogUseCase.listProducts — reservas no card", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.barbershopFindUnique.mockResolvedValue({ timezone: "America/Sao_Paulo" });
    mocks.productFindMany.mockResolvedValue([productRow()]);
    mocks.productCount.mockResolvedValue(1);
    mocks.reservationFindMany.mockResolvedValue([]);
    mocks.userFindUnique.mockResolvedValue({ permissions: [] });
  });

  it("soma apenas reservas vigentes (vencida e finalizada ficam de fora)", async () => {
    mocks.reservationFindMany.mockResolvedValue([
      reservationRow({ id: "res-ok", quantity: 2 }),
      reservationRow({ id: "res-finalizada", status: "CANCELED" }),
      reservationRow({ id: "res-vencida", expiresAt: past() }),
    ]);

    const { data } = await list(OWNER);
    const product = data[0] as Record<string, unknown>;

    expect(product.reservedQty).toBe(2);
    expect(product.availableQty).toBe(3);
    expect((product.reservations as Array<{ id: string }>).map((r) => r.id)).toEqual(["res-ok"]);

    // A query já filtra status/prazo; a soma em memória confirma de novo.
    expect(mocks.reservationFindMany).toHaveBeenCalledTimes(1);
    expect(mocks.reservationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          barbershopId: SHOP,
          productId: { in: [PRODUCT] },
          status: "RESERVED",
          expiresAt: { gt: expect.any(Date) },
        }),
        orderBy: { createdAt: "asc" },
      }),
    );
  });

  it("sem reservas devolve reservedQty 0 e lista vazia", async () => {
    const { data } = await list(OWNER);
    const product = data[0] as Record<string, unknown>;

    expect(product.reservedQty).toBe(0);
    expect(product.availableQty).toBe(5);
    expect(product.reservations).toEqual([]);
  });

  it("esconde nome/WhatsApp de quem só tem INVENTORY_MANAGE", async () => {
    mocks.userFindUnique.mockResolvedValue({ permissions: ["INVENTORY_MANAGE"] });
    mocks.reservationFindMany.mockResolvedValue([reservationRow()]);

    const { data } = await list(EMPLOYEE);
    const product = data[0] as Record<string, unknown>;

    expect(product.reservedQty).toBe(2);
    expect(product).not.toHaveProperty("reservations");
    expect(JSON.stringify(product)).not.toContain("Ana Souza");
    expect(JSON.stringify(product)).not.toContain("11988887777");

    // Nem busca os dados pessoais quando o usuário não pode vê-los.
    const select = (mocks.reservationFindMany.mock.calls[0][0] as { select: Record<string, unknown> }).select;
    expect(select).not.toHaveProperty("customerName");
    expect(select).not.toHaveProperty("whatsapp");
  });

  it("mantém o contato do cliente para quem pode ver a aba Reservas", async () => {
    mocks.userFindUnique.mockResolvedValue({ permissions: ["PRODUCTS_VIEW"] });
    mocks.reservationFindMany.mockResolvedValue([reservationRow()]);

    const { data } = await list(EMPLOYEE);
    const reservations = (data[0] as { reservations: Array<Record<string, unknown>> }).reservations;

    expect(reservations).toHaveLength(1);
    expect(reservations[0]).toMatchObject({
      customerName: "Ana Souza",
      whatsapp: "11988887777",
      quantity: 2,
    });
  });

  it("availableQty é null sem controle de estoque e nunca fica negativo", async () => {
    mocks.productFindMany.mockResolvedValue([
      productRow({ id: "p-slim", trackStock: false }),
      productRow({ id: "p-neg", stockQty: 1 }),
    ]);
    mocks.productCount.mockResolvedValue(2);
    mocks.reservationFindMany.mockResolvedValue([
      reservationRow({ id: "r1", productId: "p-slim", quantity: 4 }),
      reservationRow({ id: "r2", productId: "p-neg", quantity: 4 }),
    ]);

    const { data } = await list(OWNER);

    expect((data[0] as Record<string, unknown>).availableQty).toBeNull();
    expect((data[1] as Record<string, unknown>).availableQty).toBe(0);
    expect((data[1] as Record<string, unknown>).reservedQty).toBe(4);
  });

  it("anexa reservas também no caminho lowStock (SQL cru)", async () => {
    mocks.queryRaw
      .mockReturnValueOnce([{ id: PRODUCT }])
      .mockReturnValueOnce([{ count: 1n }]);
    mocks.productFindMany.mockResolvedValue([productRow({ minStock: 10, stockQty: 5 })]);
    mocks.reservationFindMany.mockResolvedValue([reservationRow()]);

    const { data, total } = await list(OWNER, { lowStock: "true" });

    expect(total).toBe(1);
    const product = data[0] as Record<string, unknown>;
    expect(product.reservedQty).toBe(2);
    expect(product.availableQty).toBe(3);
    expect(product.reservations).toHaveLength(1);
    expect(mocks.reservationFindMany).toHaveBeenCalledTimes(1);
  });

  it("não consulta reservas quando a página não tem produtos", async () => {
    mocks.productFindMany.mockResolvedValue([]);
    mocks.productCount.mockResolvedValue(0);

    const { data } = await list(OWNER);

    expect(data).toEqual([]);
    expect(mocks.reservationFindMany).not.toHaveBeenCalled();
  });
});
