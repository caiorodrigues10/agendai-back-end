/// <reference types="vitest/globals" />

const state = vi.hoisted(() => ({ tx: null as any }));

const prismaMock = vi.hoisted(() => ({
  retailSale: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn() },
  salonClient: { findFirst: vi.fn(), findUnique: vi.fn() },
  queueItem: { findFirst: vi.fn() },
  appointment: { findFirst: vi.fn() },
}));

vi.mock("@/libs/prismaClient", () => ({ prisma: prismaMock }));
vi.mock("@/libs/prismaExtensions", () => ({
  rlsTransaction: (fn: (tx: any) => Promise<any>) => fn(state.tx),
}));
vi.mock("@/modules/crm/services/crmLedger", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/crm/services/crmLedger")>()),
  recordCrmFinancialEvent: vi.fn().mockResolvedValue(undefined),
}));

import { InventoryEngine } from "./InventoryEngine";

function autoMock(overrides: Record<string, Record<string, any>>): any {
  const cache: Record<string, any> = {};
  const fallbackFn = () => vi.fn().mockResolvedValue(undefined);
  return new Proxy(
    {},
    {
      get(target, prop: string | symbol) {
        if (typeof prop !== "string") return undefined;
        if (prop in overrides) return overrides[prop];
        if (prop in (target as Record<string, any>)) {
          return (target as Record<string, any>)[prop];
        }
        if (prop.startsWith("$")) {
          if (!cache[prop]) cache[prop] = fallbackFn();
          return cache[prop];
        }
        if (!cache[prop]) {
          const methods: Record<string, any> = {};
          cache[prop] = new Proxy(methods, {
            get(_m, name: string | symbol) {
              if (typeof name !== "string") return undefined;
              if (!methods[name]) methods[name] = fallbackFn();
              return methods[name];
            },
          });
        }
        return cache[prop];
      },
    },
  );
}

const product = {
  id: "p1",
  barbershopId: "shop-1",
  name: "Pomada",
  active: true,
  type: "RETAIL",
  trackStock: true,
  stockQty: 5,
  salePrice: 40,
  averageCost: 10,
};

function setup() {
  const sale = {
    id: "sale-1",
    barbershopId: "shop-1",
    clientId: null,
    paymentMethod: "pix",
    subtotal: 40,
    discount: 0,
    total: 40,
    soldAt: new Date("2026-10-01T15:00:00Z"),
    status: "COMPLETED",
  };
  state.tx = autoMock({
    product: {
      findUnique: vi.fn().mockResolvedValue(product),
      update: vi.fn().mockResolvedValue(undefined),
    },
    retailSale: {
      create: vi.fn().mockResolvedValue(sale),
      findUniqueOrThrow: vi.fn().mockResolvedValue(sale),
      update: vi.fn().mockResolvedValue(undefined),
    },
    cashMovement: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "led-1" }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  });
  prismaMock.retailSale.findUnique.mockResolvedValue(null);
  prismaMock.retailSale.findUniqueOrThrow.mockResolvedValue(sale);
  prismaMock.salonClient.findFirst.mockResolvedValue({ id: "client-1", name: "Ana", whatsapp: "5511999990000" });
  prismaMock.salonClient.findUnique.mockResolvedValue({ id: "client-1", name: "Ana", whatsapp: "5511999990000" });
  prismaMock.queueItem.findFirst.mockResolvedValue({ id: "q-1" });
  prismaMock.appointment.findFirst.mockResolvedValue({ id: "appt-1" });
  return { sale };
}

describe("InventoryEngine — ledger de venda/estorno de produto", () => {
  beforeEach(() => vi.clearAllMocks());

  it("venda em pix grava PRODUCT_SALE na mesma transação", async () => {
    const { sale } = setup();
    const engine = new InventoryEngine();

    await engine.createRetailSale({
      barbershopId: "shop-1",
      soldById: "user-1",
      paymentMethod: "pix",
      items: [{ productId: "p1", quantity: 1 }],
      idempotencyKey: "key-1",
      allowPriceOverride: false,
    });

    expect(state.tx.cashMovement.create).toHaveBeenCalledTimes(1);
    const data = state.tx.cashMovement.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      barbershopId: "shop-1",
      type: "PRODUCT_SALE",
      paymentMethod: "PIX",
      sourceType: "RETAIL_SALE",
      sourceId: "sale-1",
      professionalId: "user-1",
      idempotencyKey: "shop-1:RETAIL_SALE:sale-1:PRODUCT_SALE",
    });
    expect(Number(data.amount)).toBe(40);
    expect(data.occurredAt).toEqual(sale.soldAt);
  });

  it("venda fiada reconhece receita com método FIADO (fora do caixa)", async () => {
    setup();
    const engine = new InventoryEngine();

    await engine.createRetailSale({
      barbershopId: "shop-1",
      soldById: "user-1",
      clientId: "client-1",
      paymentMethod: "fiado",
      items: [{ productId: "p1", quantity: 1 }],
      idempotencyKey: "key-2",
      allowPriceOverride: false,
    });

    const data = state.tx.cashMovement.create.mock.calls[0][0].data;
    expect(data.type).toBe("PRODUCT_SALE");
    expect(data.paymentMethod).toBe("FIADO");
    expect(state.tx.fiado.create).toHaveBeenCalledTimes(1);
  });

  it("estorno grava REFUND pelo valor devolvido em dinheiro", async () => {
    const { sale } = setup();
    state.tx.retailSale.findFirst = vi.fn().mockResolvedValue({
      ...sale,
      lines: [
        { id: "line-1", productId: "p1", productName: "Pomada", quantity: 1, unitPrice: 40, unitCost: 10, refundedQty: 0 },
      ],
      fiado: null,
    });
    state.tx.retailSaleRefund = {
      create: vi.fn().mockResolvedValue({ id: "refund-1" }),
    };
    state.tx.retailSaleLine = {
      update: vi.fn().mockResolvedValue(undefined),
      findMany: vi
        .fn()
        .mockResolvedValue([
          { id: "line-1", productId: "p1", quantity: 1, unitPrice: 40, unitCost: 10, refundedQty: 1 },
        ]),
    };
    const engine = new InventoryEngine();

    const result = await engine.refundRetailSale({
      barbershopId: "shop-1",
      saleId: "sale-1",
      createdById: "user-1",
      reason: "Cliente desistiu",
      restock: true,
      refundMethod: "pix",
      items: [{ productId: "p1", quantity: 1 }],
    });

    void result;
    expect(state.tx.cashMovement.create).toHaveBeenCalledTimes(1);
    const data = state.tx.cashMovement.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      type: "REFUND",
      paymentMethod: "PIX",
      sourceType: "RETAIL_REFUND",
      sourceId: "refund-1",
      relatedSourceId: "sale-1",
    });
    expect(Number(data.amount)).toBe(40);
  });

  it("estorno de venda fiada separa caixa e crédito (dois lançamentos)", async () => {
    const { sale } = setup();
    const fiado = {
      id: "fiado-1",
      originalAmount: 40,
      paidAmount: 0,
      creditAdjustedAmount: 0,
    };
    state.tx.retailSale.findFirst = vi.fn().mockResolvedValue({
      ...sale,
      paymentMethod: "fiado",
      lines: [
        { id: "line-1", productId: "p1", productName: "Pomada", quantity: 1, unitPrice: 40, unitCost: 10, refundedQty: 0 },
      ],
      fiado,
    });
    state.tx.retailSaleRefund = {
      create: vi.fn().mockResolvedValue({ id: "refund-1" }),
    };
    state.tx.retailSaleLine = {
      update: vi.fn().mockResolvedValue(undefined),
      findMany: vi
        .fn()
        .mockResolvedValue([
          { id: "line-1", productId: "p1", quantity: 1, unitPrice: 40, unitCost: 10, refundedQty: 1 },
        ]),
    };
    const engine = new InventoryEngine();

    const result = await engine.refundRetailSale({
      barbershopId: "shop-1",
      saleId: "sale-1",
      createdById: "user-1",
      reason: "Produto com defeito",
      restock: true,
      refundMethod: "cash",
      items: [{ productId: "p1", quantity: 1 }],
    });

    void result;
    const calls = state.tx.cashMovement.create.mock.calls.map((c: any) => c[0].data);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ type: "REFUND", sourceType: "RETAIL_REFUND_CREDIT" });
    expect(calls[0].paymentMethod).toBe("FIADO"); // não movimenta caixa
    expect(Number(calls[0].amount)).toBe(40);
  });
});
