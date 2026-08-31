import { describe, it, expect, beforeEach, vi } from "vitest";
import { handleSubscriptionPaymentWebhook } from "./handleSubscriptionPaymentWebhook";

const prismaMock = vi.hoisted(() => ({
  invoice: { findUnique: vi.fn(), update: vi.fn() },
  plan: { findUnique: vi.fn() },
  subscription: { findUnique: vi.fn(), update: vi.fn() },
  payment: { findFirst: vi.fn() },
  refund: { findFirst: vi.fn() },
  adminNotification: { create: vi.fn() },
  $transaction: vi.fn((ops: any[]) => Promise.all(ops)),
}));

vi.mock("@/libs/prismaClient", () => ({ prisma: prismaMock }));

vi.mock("@/modules/subscriptions/utils/checkBarbershopAccess", () => ({
  unblockOwnerCpfs: vi.fn().mockResolvedValue(undefined),
  blockOwnerCpfs: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/shared/infra/http/middlewares/subscriptionAccessCache", () => ({
  invalidateSubscriptionCache: vi.fn(),
}));

vi.mock("@/modules/referrals/services/referralService", () => ({
  qualifyReferralOnPayment: vi.fn().mockResolvedValue(undefined),
  revokeReferralOnCancellation: vi.fn().mockResolvedValue(undefined),
}));

const REF = "ag-sub-1-inv-1";

function makeSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub-1",
    barbershopId: "shop-1",
    status: "ACTIVE",
    startDate: new Date("2026-01-01T00:00:00.000Z"),
    endDate: new Date("2026-12-31T00:00:00.000Z"),
    cancelDate: null,
    cancelReason: null,
    plan: { billingCycle: "YEARLY" },
    ...overrides,
  };
}

describe("handleSubscriptionPaymentWebhook — eventos negativos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.invoice.findUnique.mockResolvedValue({
      id: "inv-1",
      subscriptionId: "1",
      status: "PAID",
    });
    prismaMock.subscription.findUnique.mockResolvedValue(makeSubscription());
    prismaMock.invoice.update.mockImplementation((args: any) =>
      Promise.resolve({ id: "inv-1", ...args.data })
    );
    prismaMock.subscription.update.mockImplementation((args: any) =>
      Promise.resolve(makeSubscription({ ...args.data }))
    );
    prismaMock.payment.findFirst.mockResolvedValue({ id: "pay-1" });
    prismaMock.refund.findFirst.mockResolvedValue(null);
    prismaMock.adminNotification.create.mockResolvedValue({});
  });

  it("in_mediation → assinatura UNPAID e invoice PENDING (acesso suspenso)", async () => {
    await handleSubscriptionPaymentWebhook(REF, "in_mediation");

    expect(prismaMock.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "PENDING" }) })
    );
    expect(prismaMock.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "UNPAID" }) })
    );
    expect(prismaMock.adminNotification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ title: "Pagamento sob disputa" }),
      })
    );
  });

  it("charged_back → assinatura CANCELADA com revogação imediata (endDate = now)", async () => {
    await handleSubscriptionPaymentWebhook(REF, "charged_back");

    const subUpdate = prismaMock.subscription.update.mock.calls[0][0];
    expect(subUpdate.data.status).toBe("CANCELED");
    expect(subUpdate.data.cancelDate).toBeInstanceOf(Date);
    expect(subUpdate.data.endDate).toBeInstanceOf(Date);
    expect(subUpdate.data.cancelReason).toBe("chargeback");
    expect(prismaMock.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "CANCELLED" }) })
    );
  });

  it("refunded com refund interno existente → alerta de possível dupla devolução", async () => {
    prismaMock.refund.findFirst.mockResolvedValue({ id: "refund-1", amount: 167 });

    await handleSubscriptionPaymentWebhook(REF, "refunded");

    expect(prismaMock.adminNotification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: "ALERTA: possível dupla devolução (estorno externo + refund interno)",
        }),
      })
    );
  });

  it("refunded com assinatura já CANCELADA → não regride o status", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(
      makeSubscription({ status: "CANCELED", cancelReason: "price" })
    );

    await handleSubscriptionPaymentWebhook(REF, "refunded");

    expect(prismaMock.subscription.update).not.toHaveBeenCalled();
    expect(prismaMock.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "CANCELLED" }) })
    );
  });

  it("rejected → mantém PAST_DUE (comportamento legado)", async () => {
    await handleSubscriptionPaymentWebhook(REF, "rejected");

    expect(prismaMock.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "CANCELLED" }) })
    );
    expect(prismaMock.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "PAST_DUE" }) })
    );
  });

  it("approved → ativa assinatura e paga invoice (legado)", async () => {
    prismaMock.invoice.findUnique.mockResolvedValue({
      id: "inv-1",
      subscriptionId: "1",
      status: "PENDING",
    });

    await handleSubscriptionPaymentWebhook(REF, "approved");

    expect(prismaMock.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "ACTIVE" }) })
    );
    expect(prismaMock.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "PAID" }) })
    );
  });

  it("approved → aplica o plano que estava pendente na fatura", async () => {
    prismaMock.invoice.findUnique.mockResolvedValue({
      id: "inv-1",
      subscriptionId: "1",
      status: "PENDING",
      planId: "plan-pro-yearly",
    });
    prismaMock.plan.findUnique.mockResolvedValue({
      id: "plan-pro-yearly",
      billingCycle: "YEARLY",
    });

    await handleSubscriptionPaymentWebhook(REF, "approved");

    expect(prismaMock.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "ACTIVE", planId: "plan-pro-yearly" }),
      })
    );
  });
});
