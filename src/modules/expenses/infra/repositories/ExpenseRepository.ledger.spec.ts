/// <reference types="vitest/globals" />

const prismaMock = vi.hoisted(() => ({ $transaction: vi.fn() }));

vi.mock("@/libs/prismaClient", () => ({ prisma: prismaMock, Prisma: {} }));

import { ExpenseRepository } from "./ExpenseRepository";

const expenseRow = {
  id: "exp-1",
  barbershopId: "shop-1",
  categoryId: null,
  title: "Aluguel",
  description: null,
  amount: 1500,
  type: "FIXED",
  recurrence: "MONTHLY",
  referenceDate: new Date("2026-10-01T00:00:00Z"),
  paidAt: new Date("2026-10-02T13:00:00Z"),
  dueDate: null,
  paymentMethod: "pix",
  supplierName: null,
  receiptUrl: null,
  notes: null,
  createdById: "user-1",
  updatedById: null,
  locked: false,
  inventoryReceiptId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  category: null,
};

function setup() {
  const tx = {
    expense: {
      create: vi.fn().mockResolvedValue(expenseRow),
      update: vi.fn().mockImplementation((args: any) =>
        Promise.resolve({ ...expenseRow, ...args.data }),
      ),
      delete: vi.fn().mockResolvedValue(expenseRow),
      findUnique: vi.fn().mockResolvedValue({ barbershopId: "shop-1" }),
    },
    cashMovement: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "led-1" }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  prismaMock.$transaction.mockReset().mockImplementation(async (fn: any) => fn(tx));
  return { tx };
}

const createInput = {
  barbershopId: "shop-1",
  title: "Aluguel",
  amount: 1500,
  referenceDate: new Date("2026-10-01T00:00:00Z"),
  paidAt: new Date("2026-10-02T13:00:00Z"),
  paymentMethod: "pix",
  createdById: "user-1",
};

describe("ExpenseRepository — despesa paga alimenta o ledger", () => {
  beforeEach(() => vi.clearAllMocks());

  it("criar despesa paga lança EXPENSE no dia do pagamento", async () => {
    const { tx } = setup();
    const repo = new ExpenseRepository();

    await repo.create(createInput);

    expect(tx.cashMovement.create).toHaveBeenCalledTimes(1);
    const data = tx.cashMovement.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      barbershopId: "shop-1",
      type: "EXPENSE",
      paymentMethod: "PIX",
      sourceType: "EXPENSE",
      sourceId: "exp-1",
      createdBy: "user-1",
      idempotencyKey: "shop-1:EXPENSE:exp-1:EXPENSE",
    });
    expect(Number(data.amount)).toBe(1500);
    expect(data.occurredAt).toEqual(expenseRow.paidAt);
  });

  it("despesa ainda não paga não gera lançamento", async () => {
    const { tx } = setup();
    tx.expense.create.mockResolvedValue({ ...expenseRow, paidAt: null });
    const repo = new ExpenseRepository();

    await repo.create({ ...createInput, paidAt: null });

    expect(tx.cashMovement.create).not.toHaveBeenCalled();
  });

  it("editar pagamento regrava o lançamento de forma idempotente", async () => {
    const { tx } = setup();
    const repo = new ExpenseRepository();

    await repo.update("exp-1", { paymentMethod: "cash", amount: 1450, updatedById: "user-2" });

    expect(tx.cashMovement.deleteMany).toHaveBeenCalledTimes(1);
    expect(tx.cashMovement.deleteMany.mock.calls[0][0].where).toMatchObject({
      barbershopId: "shop-1",
      sourceType: "EXPENSE",
      sourceId: "exp-1",
      type: "EXPENSE",
    });
    expect(tx.cashMovement.create).toHaveBeenCalledTimes(1);
    expect(tx.cashMovement.create.mock.calls[0][0].data.paymentMethod).toBe("CASH");
  });

  it("desmarcar pagamento remove o lançamento", async () => {
    const { tx } = setup();
    tx.expense.update.mockResolvedValue({ ...expenseRow, paidAt: null });
    const repo = new ExpenseRepository();

    await repo.update("exp-1", { paidAt: null });

    expect(tx.cashMovement.deleteMany).toHaveBeenCalledTimes(1);
    expect(tx.cashMovement.create).not.toHaveBeenCalled();
  });

  it("excluir despesa limpa o lançamento do ledger", async () => {
    const { tx } = setup();
    const repo = new ExpenseRepository();

    await repo.delete("exp-1");

    expect(tx.expense.delete).toHaveBeenCalledTimes(1);
    expect(tx.cashMovement.deleteMany).toHaveBeenCalledTimes(1);
    expect(tx.cashMovement.deleteMany.mock.calls[0][0].where.sourceId).toBe("exp-1");
  });
});
