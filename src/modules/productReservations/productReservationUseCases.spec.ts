/// <reference types="vitest/globals" />
import { AppError } from "@/shared/errors/AppError";

const { assertShop, notifyShop } = vi.hoisted(() => ({
  assertShop: vi.fn(),
  notifyShop: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/shared/utils/assertPublicShopOperationalAccess", () => ({
  assertPublicShopOperationalAccess: assertShop,
}));
vi.mock("./reservationNotify", () => ({ notifyShopAboutReservation: notifyShop }));

import { ProductReservationUseCases } from "./productReservationUseCases";
import { createProductReservationSchema } from "./productReservationSchemas";
import type { IProductReservationRepository, PublicProductRow, PublicShop } from "./productReservationRepository";

const SHOP_ID = "00000000-0000-0000-0000-000000000001";
const OTHER_SHOP = "00000000-0000-0000-0000-000000000099";
const PRODUCT_ID = "00000000-0000-0000-0000-000000000002";
const RESERVATION_ID = "00000000-0000-0000-0000-000000000003";

const shop: PublicShop = {
  id: SHOP_ID,
  name: "Barbearia Central",
  address: "Rua das Flores, 100",
  city: "São Paulo",
  whatsapp: "11999999999",
  timezone: "America/Sao_Paulo",
};

const productRow = (over: Partial<PublicProductRow> = {}): PublicProductRow => ({
  id: PRODUCT_ID,
  name: "Pomada Modeladora",
  description: "Fixação forte",
  imageUrl: "https://cdn/pomada.jpg",
  salePrice: 40,
  unitLabel: "unidade",
  categoryId: "cat-1",
  categoryName: "Cabelo",
  stockQty: 5,
  trackStock: true,
  ...over,
});

const reservationRow = (over: Record<string, unknown> = {}) => ({
  id: RESERVATION_ID,
  barbershopId: SHOP_ID,
  productId: PRODUCT_ID,
  customerName: "Ana Souza",
  whatsapp: "11988887777",
  quantity: 1,
  unitPrice: 40,
  status: "RESERVED",
  expiresAt: new Date("2026-10-03T12:00:00.000Z"),
  createdAt: new Date("2026-10-01T12:00:00.000Z"),
  updatedAt: new Date("2026-10-01T12:00:00.000Z"),
  productName: "Pomada Modeladora",
  ...over,
});

function makeRepo(overrides: Partial<Record<keyof IProductReservationRepository, unknown>> = {}) {
  const repo = {
    findShopForPublic: vi.fn().mockResolvedValue(shop),
    listPublicProducts: vi.fn().mockResolvedValue([]),
    findPublicProduct: vi.fn().mockResolvedValue(null),
    sumReservedQuantity: vi.fn().mockResolvedValue({}),
    countOpenReservationsByWhatsapp: vi.fn().mockResolvedValue(0),
    createReserved: vi.fn(),
    listReservations: vi.fn().mockResolvedValue({ data: [], total: 0 }),
    findById: vi.fn().mockResolvedValue(null),
    markFinalized: vi.fn().mockResolvedValue(false),
    ...overrides,
  };
  return repo;
}

function useCasesWith(overrides: Parameters<typeof makeRepo>[0] = {}) {
  const repo = makeRepo(overrides);
  return { repo, useCases: new ProductReservationUseCases(repo as unknown as IProductReservationRepository) };
}

describe("ProductReservationUseCases — vitrine pública", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertShop.mockResolvedValue(undefined);
  });

  it("calcula o disponível como stockQty − reservas RESERVED não vencidas", async () => {
    const { repo, useCases } = useCasesWith({
      listPublicProducts: vi.fn().mockResolvedValue([
        productRow({ id: "p1", stockQty: 5 }),
        productRow({ id: "p2", stockQty: 3 }),
        productRow({ id: "p3", stockQty: 0, trackStock: false }),
      ]),
      sumReservedQuantity: vi.fn().mockResolvedValue({ p1: 2, p2: 3 }),
    });

    const { products } = await useCases.listPublicProducts(SHOP_ID);

    expect(products.map((p) => [p.id, p.available])).toEqual([
      ["p1", 3],
      // 3 − 3 = 0 → segue na vitrine com available 0 (selo "Esgotado")
      ["p2", 0],
      ["p3", null],
    ]);
    expect(repo.sumReservedQuantity).toHaveBeenCalledWith(
      SHOP_ID,
      ["p1", "p2", "p3"],
      expect.any(Date),
    );
  });

  it("lista produto esgotado com available 0 (nunca negativo)", async () => {
    const { useCases } = useCasesWith({
      listPublicProducts: vi.fn().mockResolvedValue([
        productRow({ id: "p1", stockQty: 1 }),
        productRow({ id: "p2", stockQty: 0 }),
      ]),
      sumReservedQuantity: vi.fn().mockResolvedValue({ p1: 4 }),
    });

    const { products } = await useCases.listPublicProducts(SHOP_ID);

    expect(products.map((p) => [p.id, p.available])).toEqual([
      ["p1", 0],
      ["p2", 0],
    ]);
  });

  it("expõe no DTO público apenas os campos autorizados (sem custo, SKU, código ou lote)", async () => {
    const { useCases } = useCasesWith({
      findPublicProduct: vi.fn().mockResolvedValue(productRow()),
      sumReservedQuantity: vi.fn().mockResolvedValue({ [PRODUCT_ID]: 2 }),
    });

    const { product } = await useCases.getPublicProduct(SHOP_ID, PRODUCT_ID);

    expect(Object.keys(product).sort()).toEqual([
      "available",
      "category",
      "description",
      "id",
      "imageUrl",
      "name",
      "price",
      "unitLabel",
    ]);
    expect(product.price).toBe(40);
    expect(product.available).toBe(3);
  });

  it("devolve 404 quando o salão não existe ou não está operacional", async () => {
    const { useCases } = useCasesWith({
      findShopForPublic: vi.fn().mockResolvedValue(null),
    });

    await expect(useCases.listPublicProducts(SHOP_ID)).rejects.toMatchObject({
      message: "Estabelecimento não encontrado",
      statusCode: 404,
    } satisfies Partial<AppError>);
    expect(assertShop).toHaveBeenCalledWith(SHOP_ID);
  });

  it("propaga o 404 do guard público de salão", async () => {
    assertShop.mockRejectedValue(new AppError("Estabelecimento não encontrado", 404));
    const { useCases } = useCasesWith();

    await expect(useCases.getPublicProduct(SHOP_ID, PRODUCT_ID)).rejects.toMatchObject({
      statusCode: 404,
    } satisfies Partial<AppError>);
  });

  it("devolve 404 quando o produto não existe no salão", async () => {
    const { repo, useCases } = useCasesWith({
      findPublicProduct: vi.fn().mockResolvedValue(null),
    });

    await expect(useCases.getPublicProduct(SHOP_ID, PRODUCT_ID)).rejects.toMatchObject({
      message: "Produto não encontrado",
      statusCode: 404,
    } satisfies Partial<AppError>);
    expect(repo.sumReservedQuantity).not.toHaveBeenCalled();
  });
});

describe("ProductReservationUseCases — reserva", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertShop.mockResolvedValue(undefined);
  });

  it("congela o preço do produto no momento da reserva", async () => {
    const { repo, useCases } = useCasesWith({
      findPublicProduct: vi.fn().mockResolvedValue(productRow({ salePrice: 40 })),
      createReserved: vi.fn().mockResolvedValue(reservationRow()),
    });

    const { reservation } = await useCases.reserve(SHOP_ID, PRODUCT_ID, {
      customerName: "Ana Souza",
      whatsapp: "11988887777",
      quantity: 1,
    });

    expect(repo.createReserved).toHaveBeenCalledWith(
      expect.objectContaining({
        barbershopId: SHOP_ID,
        productId: PRODUCT_ID,
        whatsapp: "11988887777",
        unitPrice: 40,
        quantity: 1,
      }),
    );
    expect(reservation.unitPrice).toBe(40);
    expect(reservation.status).toBe("RESERVED");
  });

  it("bloqueia quando o estoque disponível é menor que a quantidade", async () => {
    const { repo, useCases } = useCasesWith({
      findPublicProduct: vi.fn().mockResolvedValue(productRow({ stockQty: 2 })),
      sumReservedQuantity: vi.fn().mockResolvedValue({ [PRODUCT_ID]: 1 }),
    });

    await expect(
      useCases.reserve(SHOP_ID, PRODUCT_ID, {
        customerName: "Ana Souza",
        whatsapp: "11988887777",
        quantity: 2,
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "INSUFFICIENT_STOCK",
    } satisfies Partial<AppError>);
    expect(repo.createReserved).not.toHaveBeenCalled();
  });

  it("permite reservar quando o produto não controla estoque", async () => {
    const { repo, useCases } = useCasesWith({
      findPublicProduct: vi.fn().mockResolvedValue(productRow({ stockQty: 0, trackStock: false })),
      createReserved: vi.fn().mockResolvedValue(reservationRow()),
    });

    const { reservation } = await useCases.reserve(SHOP_ID, PRODUCT_ID, {
      customerName: "Ana Souza",
      whatsapp: "11988887777",
      quantity: 2,
    });

    // Sem controle de estoque o disponível é null (ilimitado): passa direto.
    expect(repo.createReserved).toHaveBeenCalledWith(expect.objectContaining({ quantity: 2 }));
    expect(reservation.id).toBe(RESERVATION_ID);
  });

  it("limite de 3 reservas abertas por WhatsApp no mesmo salão", async () => {
    const { repo, useCases } = useCasesWith({
      findPublicProduct: vi.fn().mockResolvedValue(productRow()),
      countOpenReservationsByWhatsapp: vi.fn().mockResolvedValue(3),
      createReserved: vi.fn().mockResolvedValue(reservationRow()),
    });

    await expect(
      useCases.reserve(SHOP_ID, PRODUCT_ID, {
        customerName: "Ana Souza",
        whatsapp: "11988887777",
        quantity: 1,
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "RESERVATION_LIMIT_REACHED",
    } satisfies Partial<AppError>);
    expect(repo.createReserved).not.toHaveBeenCalled();
  });

  it("deixa o repository decidir a disponibilidade final dentro da transação", async () => {
    const { useCases } = useCasesWith({
      findPublicProduct: vi.fn().mockResolvedValue(productRow({ stockQty: 5 })),
      createReserved: vi
        .fn()
        .mockRejectedValue(new AppError("Estoque insuficiente. Disponível: 1 unidade", 409, undefined, "INSUFFICIENT_STOCK")),
    });

    await expect(
      useCases.reserve(SHOP_ID, PRODUCT_ID, {
        customerName: "Ana Souza",
        whatsapp: "11988887777",
        quantity: 1,
      }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" } satisfies Partial<AppError>);
  });

  it("dispara o aviso ao salão sem await e mesmo se o aviso falhar", async () => {
    notifyShop.mockRejectedValueOnce(new Error("fila de notificações fora do ar"));
    const { repo, useCases } = useCasesWith({
      findPublicProduct: vi.fn().mockResolvedValue(productRow({ salePrice: 40 })),
      createReserved: vi.fn().mockResolvedValue(reservationRow({ quantity: 2 })),
    });

    const { reservation } = await useCases.reserve(SHOP_ID, PRODUCT_ID, {
      customerName: "Ana Souza",
      whatsapp: "11988887777",
      quantity: 2,
    });

    expect(reservation.id).toBe(RESERVATION_ID);
    expect(repo.createReserved).toHaveBeenCalledTimes(1);
    expect(notifyShop).toHaveBeenCalledWith(
      expect.objectContaining({
        barbershopId: SHOP_ID,
        reservationId: RESERVATION_ID,
        shopName: shop.name,
        shopTimezone: shop.timezone,
        productName: "Pomada Modeladora",
        quantity: 2,
        customerName: "Ana Souza",
        whatsapp: "11988887777",
      }),
    );
  });

  it("não avisa o salão quando a reserva não chega a ser criada", async () => {
    const { useCases } = useCasesWith({
      findPublicProduct: vi.fn().mockResolvedValue(productRow({ stockQty: 5 })),
      sumReservedQuantity: vi.fn().mockResolvedValue({ [PRODUCT_ID]: 5 }),
      createReserved: vi.fn(),
    });

    await expect(
      useCases.reserve(SHOP_ID, PRODUCT_ID, { customerName: "Ana", whatsapp: "11988887777", quantity: 1 }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" } satisfies Partial<AppError>);

    expect(notifyShop).not.toHaveBeenCalled();
  });
});

describe("ProductReservationUseCases — painel do dono", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertShop.mockResolvedValue(undefined);
  });

  it("bloqueia a alteração de uma reserva já finalizada", async () => {
    const { repo, useCases } = useCasesWith({
      findById: vi.fn().mockResolvedValue(reservationRow({ status: "PICKED_UP" })),
    });

    await expect(
      useCases.updateStatus(RESERVATION_ID, SHOP_ID, { status: "CANCELED" }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "RESERVATION_FINALIZED",
    } satisfies Partial<AppError>);
    expect(repo.markFinalized).not.toHaveBeenCalled();
  });

  it("devolve 404 para reserva de outro salão", async () => {
    const { repo, useCases } = useCasesWith({
      findById: vi.fn().mockResolvedValue(null),
    });

    await expect(
      useCases.updateStatus(RESERVATION_ID, OTHER_SHOP, { status: "CANCELED" }),
    ).rejects.toMatchObject({ statusCode: 404 } satisfies Partial<AppError>);
    expect(repo.findById).toHaveBeenCalledWith(RESERVATION_ID, OTHER_SHOP);
    expect(repo.markFinalized).not.toHaveBeenCalled();
  });

  it("rejeita corrida em que outra tela finalizou a mesma reserva", async () => {
    const { useCases } = useCasesWith({
      findById: vi
        .fn()
        .mockResolvedValueOnce(reservationRow())
        .mockResolvedValueOnce(reservationRow({ status: "CANCELED" })),
      markFinalized: vi.fn().mockResolvedValue(false),
    });

    await expect(
      useCases.updateStatus(RESERVATION_ID, SHOP_ID, { status: "PICKED_UP" }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "RESERVATION_FINALIZED",
    } satisfies Partial<AppError>);
  });

  it("finaliza uma reserva RESERVED e devolve o novo status", async () => {
    const { repo, useCases } = useCasesWith({
      findById: vi
        .fn()
        .mockResolvedValueOnce(reservationRow())
        .mockResolvedValueOnce(reservationRow({ status: "PICKED_UP" })),
      markFinalized: vi.fn().mockResolvedValue(true),
    });

    const result = await useCases.updateStatus(RESERVATION_ID, SHOP_ID, { status: "PICKED_UP" });

    expect(repo.markFinalized).toHaveBeenCalledWith(RESERVATION_ID, SHOP_ID, "PICKED_UP");
    expect(result.status).toBe("PICKED_UP");
  });

  it("pagina a lista de reservas do salão", async () => {
    const { repo, useCases } = useCasesWith({
      listReservations: vi.fn().mockResolvedValue({ data: [reservationRow()], total: 7 }),
    });

    const result = await useCases.listReservations(SHOP_ID, { status: "RESERVED", page: 2, limit: 20 });

    expect(repo.listReservations).toHaveBeenCalledWith(SHOP_ID, {
      status: "RESERVED",
      page: 2,
      limit: 20,
    });
    expect(result).toEqual({ data: [reservationRow()], total: 7, page: 2, limit: 20 });
  });
});

describe("createProductReservationSchema — normalização do WhatsApp", () => {
  it("mantém só os dígitos de um WhatsApp formatado", () => {
    const parsed = createProductReservationSchema.parse({
      customerName: "  Ana Souza  ",
      whatsapp: "(11) 98888-7777",
    });

    expect(parsed.whatsapp).toBe("11988887777");
    expect(parsed.customerName).toBe("Ana Souza");
    expect(parsed.quantity).toBe(1);
  });

  it("aceita DDD + número com 8 dígitos", () => {
    expect(
      createProductReservationSchema.parse({ customerName: "Ana", whatsapp: "11 3333 4444" }).whatsapp,
    ).toBe("1133334444");
  });

  it("rejeita WhatsApp fora do formato (menos de 10 dígitos)", () => {
    expect(() =>
      createProductReservationSchema.parse({ customerName: "Ana", whatsapp: "98888-7777" }),
    ).toThrow();
  });

  it("limita a quantidade a 1..10 e exige nome", () => {
    expect(() =>
      createProductReservationSchema.parse({ customerName: "Ana", whatsapp: "11988887777", quantity: 11 }),
    ).toThrow();
    expect(() =>
      createProductReservationSchema.parse({ customerName: "A", whatsapp: "11988887777", quantity: 1 }),
    ).toThrow();
  });
});
