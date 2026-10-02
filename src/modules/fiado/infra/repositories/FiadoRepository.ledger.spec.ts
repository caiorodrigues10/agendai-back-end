/// <reference types="vitest/globals" />

const prismaMock = vi.hoisted(() => ({ $transaction: vi.fn() }));

vi.mock("@/libs/prismaClient", () => ({ prisma: prismaMock, Prisma: {} }));

import { FiadoRepository } from "./FiadoRepository";

function setup() {
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    $queryRaw: vi.fn().mockResolvedValue([
      {
        id: "fiado-1",
        originalAmount: 100,
        paidAmount: 40,
        creditAdjustedAmount: 0,
        status: "PARTIAL",
      },
    ]),
    cashMovement: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "led-1" }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
  prismaMock.$transaction.mockReset().mockImplementation(async (fn: any) => fn(tx));
  return { tx };
}

describe("FiadoRepository.addPayment — recebimento alimenta o ledger", () => {
  beforeEach(() => vi.clearAllMocks());

  it("grava FIADO_PAYMENT com forma de pagamento e valor recebido", async () => {
    const { tx } = setup();
    const repo = new FiadoRepository();

    const payment = await repo.addPayment({
      fiadoId: "fiado-1",
      barbershopId: "shop-1",
      amount: 60,
      paymentMethod: "pix",
      registeredById: "user-1",
    });

    expect(payment.paymentMethod).toBe("pix");
    // INSERT do pagamento carrega a forma de pagamento escolhida
    // calls[0] é o set_config da RLS; o INSERT vem em seguida.
    const insertValues = tx.$executeRaw.mock.calls[1].slice(1);
    expect(insertValues).toContain("pix");

    expect(tx.cashMovement.create).toHaveBeenCalledTimes(1);
    const data = tx.cashMovement.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      barbershopId: "shop-1",
      type: "FIADO_PAYMENT",
      paymentMethod: "PIX",
      sourceType: "FIADO_PAYMENT",
      relatedSourceId: "fiado-1",
      professionalId: "user-1",
      createdBy: "user-1",
      description: "Recebimento de fiado",
    });
    expect(Number(data.amount)).toBe(60);
    expect(data.occurredAt).toBeInstanceOf(Date);
    expect(data.idempotencyKey).toMatch(/^shop-1:FIADO_PAYMENT:[0-9a-f-]+:FIADO_PAYMENT$/);
  });

  it("sem forma de pagamento informada grava CASH e não quebra o lançamento", async () => {
    const { tx } = setup();
    const repo = new FiadoRepository();

    await repo.addPayment({
      fiadoId: "fiado-1",
      barbershopId: "shop-1",
      amount: 20,
      registeredById: "user-1",
    });

    expect(tx.cashMovement.create.mock.calls[0][0].data.paymentMethod).toBe("CASH");
  });

  it("lançamento já existente não é duplicado", async () => {
    const { tx } = setup();
    tx.cashMovement.findFirst.mockResolvedValue({ id: "led-1" });
    const repo = new FiadoRepository();

    await repo.addPayment({
      fiadoId: "fiado-1",
      barbershopId: "shop-1",
      amount: 60,
      paymentMethod: "cash",
      registeredById: "user-1",
    });

    expect(tx.cashMovement.findFirst).toHaveBeenCalledTimes(1);
    expect(tx.cashMovement.create).not.toHaveBeenCalled();
  });

  it("falha no ledger desfaz o pagamento inteiro", async () => {
    const { tx } = setup();
    tx.cashMovement.create.mockRejectedValue(new Error("caixa off"));
    const repo = new FiadoRepository();

    await expect(
      repo.addPayment({
        fiadoId: "fiado-1",
        barbershopId: "shop-1",
        amount: 60,
        paymentMethod: "pix",
        registeredById: "user-1",
      }),
    ).rejects.toThrow("caixa off");
  });
});
