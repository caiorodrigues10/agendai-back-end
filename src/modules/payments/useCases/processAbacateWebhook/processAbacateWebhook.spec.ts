import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MockPaymentRepository } from "@/modules/payments/infra/repositories/mocks/MockPaymentRepository";
import { ProcessAbacateWebhookUseCase } from "./ProcessAbacateWebhookUseCase";

vi.mock("@/modules/subscriptions/services/handleSubscriptionPaymentWebhook", () => ({
  handleSubscriptionPaymentWebhook: vi.fn().mockResolvedValue(undefined),
}));

import { handleSubscriptionPaymentWebhook } from "@/modules/subscriptions/services/handleSubscriptionPaymentWebhook";

function makeAbacateMock(overrides?: {
  getCheckout?: ReturnType<typeof vi.fn>;
}) {
  return {
    getCheckout:
      overrides?.getCheckout ??
      vi.fn().mockResolvedValue({
        id: "bill_abc123",
        status: "PAID",
        amount: 9900,
        paidAmount: 9900,
        externalId: "ag-sub-sub1-inv-inv1",
        url: "https://app.abacatepay.com/pay/bill_abc123",
        devMode: false,
      }),
    verifyWebhookSignature: vi.fn().mockReturnValue(true),
  };
}

describe("ProcessAbacateWebhookUseCase", () => {
  let repo: MockPaymentRepository;
  let abacate: ReturnType<typeof makeAbacateMock>;
  let useCase: ProcessAbacateWebhookUseCase;
  const prevInsecure = process.env.ALLOW_INSECURE_WEBHOOKS;
  const prevDevMode = process.env.ABACATEPAY_ALLOW_DEV_MODE;

  beforeEach(() => {
    delete process.env.ALLOW_INSECURE_WEBHOOKS;
    delete process.env.ABACATEPAY_ALLOW_DEV_MODE;
    repo = new MockPaymentRepository();
    abacate = makeAbacateMock();
    useCase = new ProcessAbacateWebhookUseCase(repo as any, abacate as any);
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (prevInsecure === undefined) delete process.env.ALLOW_INSECURE_WEBHOOKS;
    else process.env.ALLOW_INSECURE_WEBHOOKS = prevInsecure;
    if (prevDevMode === undefined) delete process.env.ABACATEPAY_ALLOW_DEV_MODE;
    else process.env.ABACATEPAY_ALLOW_DEV_MODE = prevDevMode;
  });

  it("em checkout.completed confirma via API, marca approved e chama handler", async () => {
    const payment = await repo.create({
      mpPaymentId: null,
      provider: "ABACATEPAY",
      providerPaymentId: "bill_abc123",
      checkoutUrl: "https://app.abacatepay.com/pay/bill_abc123",
      status: "pending",
      statusDetail: "PENDING",
      paymentMethod: "payment_link",
      transactionAmount: 99,
      currency: "BRL",
      description: "Assinatura",
      barbershopId: "shop-1",
      externalReference: "ag-sub-sub1-inv-inv1",
    });

    await useCase.execute({
      event: "checkout.completed",
      data: {
        id: "bill_abc123",
        externalId: payment.externalReference,
        status: "PAID",
      },
    });

    expect(abacate.getCheckout).toHaveBeenCalledWith("bill_abc123");
    const updated = await repo.findById(payment.id);
    expect(updated?.status).toBe("approved");
    expect(handleSubscriptionPaymentWebhook).toHaveBeenCalledWith(
      "ag-sub-sub1-inv-inv1",
      "approved"
    );
  });

  it("aceita data.checkout.id (payload aninhado da Abacate)", async () => {
    await repo.create({
      provider: "ABACATEPAY",
      providerPaymentId: "bill_nested",
      status: "pending",
      statusDetail: "PENDING",
      paymentMethod: "payment_link",
      transactionAmount: 20,
      currency: "BRL",
      description: "x",
      barbershopId: "shop-1",
      externalReference: "ag-sub-a-inv-b",
    });

    abacate.getCheckout.mockResolvedValue({
      id: "bill_nested",
      status: "PAID",
      amount: 2000,
      paidAmount: 2000,
      externalId: "ag-sub-a-inv-b",
      url: "https://x",
      devMode: false,
    });

    await useCase.execute({
      event: "checkout.completed",
      data: {
        checkout: {
          id: "bill_nested",
          externalId: "ag-sub-a-inv-b",
          status: "PAID",
        },
      },
    });

    expect(abacate.getCheckout).toHaveBeenCalledWith("bill_nested");
    expect(handleSubscriptionPaymentWebhook).toHaveBeenCalled();
  });

  it("rejeita webhook com devMode sem flag explícita", async () => {
    await expect(
      useCase.execute({
        event: "checkout.completed",
        devMode: true,
        data: { id: "bill_x" },
      })
    ).rejects.toThrow(/DEV_MODE_REJECTED/);
  });

  it("rejeita se API não confirma PAID", async () => {
    await repo.create({
      provider: "ABACATEPAY",
      providerPaymentId: "bill_pending",
      status: "pending",
      statusDetail: "PENDING",
      paymentMethod: "payment_link",
      transactionAmount: 99,
      currency: "BRL",
      description: "x",
      barbershopId: "shop-1",
      externalReference: "ag-sub-a-inv-b",
    });

    abacate.getCheckout.mockResolvedValue({
      id: "bill_pending",
      status: "PENDING",
      amount: 9900,
      paidAmount: 0,
      externalId: "ag-sub-a-inv-b",
      url: "https://x",
      devMode: false,
    });

    await expect(
      useCase.execute({
        event: "checkout.completed",
        data: { id: "bill_pending" },
      })
    ).rejects.toThrow(/CHECKOUT_UNVERIFIED/);
  });

  it("rejeita se valor remoto diverge do Payment local", async () => {
    await repo.create({
      provider: "ABACATEPAY",
      providerPaymentId: "bill_amt",
      status: "pending",
      statusDetail: "PENDING",
      paymentMethod: "payment_link",
      transactionAmount: 99,
      currency: "BRL",
      description: "x",
      barbershopId: "shop-1",
      externalReference: "ag-sub-a-inv-b",
    });

    abacate.getCheckout.mockResolvedValue({
      id: "bill_amt",
      status: "PAID",
      amount: 100,
      paidAmount: 100,
      externalId: "ag-sub-a-inv-b",
      url: "https://x",
      devMode: false,
    });

    await expect(
      useCase.execute({
        event: "checkout.completed",
        data: { id: "bill_amt" },
      })
    ).rejects.toThrow(/CHECKOUT_UNVERIFIED/);
  });

  it("ignora evento desconhecido", async () => {
    await useCase.execute({ event: "payout.completed", data: { id: "x" } });
    expect(handleSubscriptionPaymentWebhook).not.toHaveBeenCalled();
  });

  it("é idempotente se já approved", async () => {
    await repo.create({
      provider: "ABACATEPAY",
      providerPaymentId: "bill_done",
      status: "approved",
      statusDetail: "checkout.completed",
      paymentMethod: "payment_link",
      transactionAmount: 10,
      currency: "BRL",
      description: "x",
      barbershopId: "shop-1",
      externalReference: "ag-sub-a-inv-b",
    });

    await useCase.execute({
      event: "checkout.completed",
      data: { id: "bill_done" },
    });

    expect(abacate.getCheckout).not.toHaveBeenCalled();
    expect(handleSubscriptionPaymentWebhook).not.toHaveBeenCalled();
  });
});
