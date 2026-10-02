/// <reference types="vitest/globals" />

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  queueItem: { findUnique: vi.fn() },
  commissionEntry: { createMany: vi.fn() },
  cashMovement: { findFirst: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
}));

vi.mock("@/libs/prismaClient", () => ({ prisma: prismaMock }));

import { QueueRepository } from "./QueueRepository";

type TxRow = {
  barbershopId: string;
  serviceId: string;
  clientId: string | null;
  customerName: string;
  appointment: { clientPackageId: string | null } | null;
};

function completedItem() {
  return {
    id: "q-1",
    barbershopId: "shop-1",
    serviceId: "svc-1",
    customerId: null,
    clientId: "client-1",
    customerName: "Ana",
    whatsapp: "5511999990000",
    joinedAt: new Date("2026-10-01T10:00:00Z"),
    calledAt: null,
    status: "COMPLETED",
    estimatedStartAt: null,
    lastNotifiedPosition: null,
    addedByStaff: false,
    responsibleQueueItemId: null,
    completedAt: new Date("2026-10-01T11:00:00Z"),
    completedBy: "user-1",
    finalPrice: 50,
    paymentMethod: "pix",
    service: { name: "Corte", avgTimeMinutes: 30 },
    responsibleQueueItem: null,
  };
}

function setup(row: TxRow, updateCount = 1) {
  const tx = {
    queueItem: {
      findUnique: vi.fn().mockResolvedValue(row),
      updateMany: vi.fn().mockResolvedValue({ count: updateCount }),
    },
    commissionEntry: prismaMock.commissionEntry,
    cashMovement: prismaMock.cashMovement,
  };
  prismaMock.$transaction.mockReset().mockImplementation(async (fn: any) => fn(tx));
  prismaMock.commissionEntry.createMany.mockReset().mockResolvedValue({ count: 1 });
  prismaMock.cashMovement.findFirst.mockReset().mockResolvedValue(null);
  prismaMock.cashMovement.create.mockReset().mockResolvedValue({ id: "led-1" });
  prismaMock.queueItem.findUnique.mockReset().mockResolvedValue(completedItem());

  return { repo: new QueueRepository(), tx };
}

const baseRow: TxRow = {
  barbershopId: "shop-1",
  serviceId: "svc-1",
  clientId: "client-1",
  customerName: "Ana",
  appointment: null,
};

describe("QueueRepository.completeWithCommissions", () => {
  it("conclui na transação, grava comissão arredondada e ledger SERVICE_SALE", async () => {
    const { repo, tx } = setup(baseRow);

    await repo.completeWithCommissions("q-1", {
      completedBy: "user-1",
      finalPrice: 33.33,
      paymentMethod: "pix",
      splits: [{ professionalId: "pro-1", percentage: 30 }],
    });

    expect(tx.queueItem.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.commissionEntry.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          barbershopId: "shop-1",
          queueItemId: "q-1",
          serviceId: "svc-1",
          professionalId: "pro-1",
          percentage: 30,
          amount: 10, // 33,33 × 30% = 9,999 → 10,00 em centavos cheios
        }),
      ],
      skipDuplicates: true,
    });

    expect(prismaMock.cashMovement.create).toHaveBeenCalledTimes(1);
    const data = prismaMock.cashMovement.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      barbershopId: "shop-1",
      type: "SERVICE_SALE",
      paymentMethod: "PIX",
      sourceType: "QUEUE_ITEM",
      sourceId: "q-1",
      professionalId: "pro-1",
      clientId: "client-1",
      idempotencyKey: "shop-1:QUEUE_ITEM:q-1:SERVICE_SALE",
    });
    expect(Number(data.amount)).toBe(33.33);
    expect(data.occurredAt).toBeInstanceOf(Date);
  });

  it("item já concluído → QUEUE_ITEM_ALREADY_COMPLETED e nada é gravado", async () => {
    const { repo, tx } = setup(baseRow, 0);

    await expect(
      repo.completeWithCommissions("q-1", {
        completedBy: "user-1",
        finalPrice: 50,
        splits: [],
      }),
    ).rejects.toThrow("QUEUE_ITEM_ALREADY_COMPLETED");

    expect(tx.commissionEntry.createMany).not.toHaveBeenCalled();
    expect(prismaMock.cashMovement.create).not.toHaveBeenCalled();
  });

  it("sessão paga por pacote não gera receita nova (sem ledger)", async () => {
    const { repo, tx } = setup({ ...baseRow, appointment: { clientPackageId: "pkg-1" } });

    await repo.completeWithCommissions("q-1", {
      completedBy: "user-1",
      finalPrice: 120,
      paymentMethod: "cash",
      splits: [{ professionalId: "pro-1", percentage: 100 }],
    });

    expect(tx.commissionEntry.createMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.cashMovement.create).not.toHaveBeenCalled();
  });

  it("serviço sem comissão (splits vazios) ainda conclui e registra a receita", async () => {
    const { repo, tx } = setup(baseRow);

    await repo.completeWithCommissions("q-1", {
      completedBy: "user-1",
      finalPrice: 80,
      paymentMethod: "cash",
      splits: [],
    });

    expect(tx.commissionEntry.createMany).not.toHaveBeenCalled();
    expect(prismaMock.cashMovement.create).toHaveBeenCalledTimes(1);
  });

  it("falha no ledger propaga o erro (transação inteira desfaz)", async () => {
    const { repo } = setup(baseRow);
    prismaMock.cashMovement.create.mockRejectedValue(new Error("caixa off"));

    await expect(
      repo.completeWithCommissions("q-1", {
        completedBy: "user-1",
        finalPrice: 50,
        splits: [],
      }),
    ).rejects.toThrow("caixa off");
  });
});
