/// <reference types="vitest/globals" />

const prismaMock = vi.hoisted(() => ({ $transaction: vi.fn() }));

vi.mock("@/libs/prismaClient", () => ({ prisma: prismaMock, Prisma: {} }));

import { ClientPackageRepository } from "./ClientPackageRepository";

const soldRecord = {
  id: "pkg-1",
  barbershopId: "shop-1",
  clientId: "client-1",
  packageId: "tpl-1",
  serviceId: "svc-1",
  totalSessions: 10,
  remainingSessions: 10,
  pricePaid: 450,
  paymentMethod: "card",
  status: "ACTIVE",
  purchasedAt: new Date("2026-10-01T14:00:00Z"),
  expiresAt: null,
  soldById: "user-1",
  createdAt: new Date(),
  updatedAt: new Date(),
  client: { name: "Ana", whatsapp: "5511999990000" },
  package: { name: "Pacote 10" },
  service: { name: "Corte", avgTimeMinutes: 30 },
};

function setup() {
  const tx = {
    clientPackage: { create: vi.fn().mockResolvedValue(soldRecord) },
    cashMovement: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "led-1" }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
  prismaMock.$transaction.mockReset().mockImplementation(async (fn: any) => fn(tx));
  return { tx };
}

describe("ClientPackageRepository — venda de pacote alimenta o ledger", () => {
  beforeEach(() => vi.clearAllMocks());

  it("grava PACKAGE_SALE com valor pago e forma normalizada", async () => {
    const { tx } = setup();
    const repo = new ClientPackageRepository();

    const created = await repo.create({
      barbershopId: "shop-1",
      clientId: "client-1",
      packageId: "tpl-1",
      serviceId: "svc-1",
      totalSessions: 10,
      remainingSessions: 10,
      pricePaid: 450,
      paymentMethod: "card",
      expiresAt: null,
      soldById: "user-1",
    });

    expect(created.id).toBe("pkg-1");
    expect(tx.cashMovement.create).toHaveBeenCalledTimes(1);
    const data = tx.cashMovement.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      barbershopId: "shop-1",
      type: "PACKAGE_SALE",
      paymentMethod: "CREDIT_CARD", // "card" genérico do pacote
      sourceType: "PACKAGE_SALE",
      sourceId: "pkg-1",
      professionalId: "user-1",
      clientId: "client-1",
      idempotencyKey: "shop-1:PACKAGE_SALE:pkg-1:PACKAGE_SALE",
    });
    expect(Number(data.amount)).toBe(450);
    expect(data.occurredAt).toEqual(soldRecord.purchasedAt);
  });

  it("lançamento idempotente: reprocessar não duplica o caixa", async () => {
    const { tx } = setup();
    tx.cashMovement.findFirst.mockResolvedValue({ id: "led-1" });
    const repo = new ClientPackageRepository();

    await repo.create({
      barbershopId: "shop-1",
      clientId: "client-1",
      packageId: "tpl-1",
      serviceId: "svc-1",
      totalSessions: 10,
      remainingSessions: 10,
      pricePaid: 450,
      paymentMethod: "pix",
      soldById: "user-1",
    });

    expect(tx.cashMovement.findFirst).toHaveBeenCalledTimes(1);
    expect(tx.cashMovement.create).not.toHaveBeenCalled();
  });
});
