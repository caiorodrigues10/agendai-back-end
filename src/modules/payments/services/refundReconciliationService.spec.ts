/// <reference types="vitest/globals" />
/**
 * Reconciliação de estornos pendentes: refund + payment (+ invoice) precisam
 * mudar de estado JUNTOS — antes eram um `$transaction([...])`, que com a
 * extensão RLS rodava cada escrita em conexão separada (não atômico).
 */
const holder = vi.hoisted(() => ({ tx: undefined as unknown }));
const rlsMock = vi.hoisted(() =>
  vi.fn(async (fn: (tx: unknown) => unknown) => fn(holder.tx)),
);
vi.mock("@/libs/prismaExtensions", () => ({ rlsTransaction: rlsMock }));

const prismaMock = vi.hoisted(() => ({
  refund: { findMany: vi.fn(), update: vi.fn() },
  subscription: { findUnique: vi.fn() },
  payment: { update: vi.fn() },
  invoice: { updateMany: vi.fn() },
}));

vi.mock("@/libs/prismaClient", () => ({ prisma: prismaMock }));

vi.mock("@/modules/notifications/services/notificationSecurity", () => ({
  sanitizeNotificationError: (err: unknown) => ({
    message: err instanceof Error ? err.message : String(err),
  }),
}));

import { reconcilePendingRefunds } from "./refundReconciliationService";

describe("reconcilePendingRefunds — atomicidade", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    holder.tx = prismaMock;
    prismaMock.refund.findMany.mockResolvedValue([
      {
        id: "ref-1",
        barbershopId: "shop-1",
        paymentId: "pay-1",
        reconciliationAttempts: 0,
        payment: {
          externalReference:
            "ag-sub-3fa85f64-5717-4562-b3fc-2c963f66afa6-inv-7ba0f7d2-0b91-4f4c-b3ac-1c5f3a0e6c11",
        },
      },
    ]);
    prismaMock.subscription.findUnique.mockResolvedValue({ id: "sub-1" });
    prismaMock.refund.update.mockResolvedValue({});
    prismaMock.payment.update.mockResolvedValue({});
    prismaMock.invoice.updateMany.mockResolvedValue({ count: 1 });
    rlsMock.mockClear();
  });

  it("reconcilia refund + payment (+ invoice) na MESMA transação", async () => {
    const resultado = await reconcilePendingRefunds();

    expect(resultado).toEqual({ reconciled: 1, failed: 0 });
    expect(rlsMock).toHaveBeenCalledTimes(1);
    expect(prismaMock.refund.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "ref-1" } })
    );
    expect(prismaMock.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "pay-1" } })
    );
    expect(prismaMock.invoice.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "7ba0f7d2-0b91-4f4c-b3ac-1c5f3a0e6c11" },
      })
    );
  });

  it("falha na transação vira failed + retry (nenhum estado parcial é assumido)", async () => {
    rlsMock.mockRejectedValueOnce(new Error("connection terminated"));

    const resultado = await reconcilePendingRefunds();

    expect(resultado).toEqual({ reconciled: 0, failed: 1 });
    expect(prismaMock.refund.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reconciliationAttempts: 1 }),
      })
    );
  });
});
