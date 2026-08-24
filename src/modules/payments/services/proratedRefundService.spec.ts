import { describe, it, expect, beforeEach, vi } from "vitest";
import { issueProratedRefund } from "./proratedRefundService";

const prismaMock = vi.hoisted(() => ({
  payment: { findFirst: vi.fn(), update: vi.fn() },
  refund: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  invoice: { findFirst: vi.fn() },
  adminNotification: { create: vi.fn() },
  $transaction: vi.fn((ops: any[]) => Promise.all(ops)),
}));

vi.mock("@/libs/prismaClient", () => ({ prisma: prismaMock }));

vi.mock("@/shared/infra/http/middlewares/subscriptionAccessCache", () => ({
  invalidateSubscriptionCache: vi.fn(),
}));

const mpMock = { refundPayment: vi.fn() };
const abacateMock = { sendPix: vi.fn() };
const asaasMock = { refundPayment: vi.fn() };

function makePayment(overrides: Record<string, unknown> = {}) {
  return {
    id: "pay-1",
    barbershopId: "shop-1",
    provider: "MERCADOPAGO",
    mpPaymentId: 123456789n,
    providerPaymentId: null,
    status: "approved",
    transactionAmount: 100,
    externalReference: "ag-sub-sub-1-inv-inv-1",
    ...overrides,
  };
}

function makeSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub-1",
    startDate: new Date("2026-01-01T00:00:00.000Z"),
    endDate: new Date("2026-12-31T00:00:00.000Z"),
    plan: { billingCycle: "MONTHLY" as const },
    ...overrides,
  } as any;
}

describe("issueProratedRefund", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.payment.findFirst.mockResolvedValue(makePayment());
    prismaMock.refund.findFirst.mockResolvedValue(null);
    prismaMock.refund.create.mockImplementation((args: any) =>
      Promise.resolve({ id: "refund-1", ...args.data })
    );
    prismaMock.refund.update.mockImplementation((args: any) =>
      Promise.resolve({ id: "refund-1", ...args.data })
    );
    prismaMock.payment.update.mockResolvedValue({});
    prismaMock.invoice.findFirst.mockResolvedValue({ paidAt: new Date("2026-01-01T00:00:00.000Z") });
    prismaMock.adminNotification.create.mockResolvedValue({});
    mpMock.refundPayment.mockResolvedValue({ id: "mp-refund-1", status: "approved" });
    abacateMock.sendPix.mockResolvedValue({ id: "pix-txn-1", status: "COMPLETE" });
    asaasMock.refundPayment.mockResolvedValue({ id: "asaas-refund-1", status: "REFUND_REQUESTED" });
  });

  it("calcula proporcional com multa de 20% e faz refund parcial no MercadoPago (mensal, 20 de 30 dias usados → 1/3 × 0,8)", async () => {
    const now = new Date("2026-01-21T00:00:00.000Z");
    const result = await issueProratedRefund({
      barbershopId: "shop-1",
      subscription: makeSubscription(),
      cancelReason: "price",
      deps: { mp: mpMock as any, abacate: abacateMock as any, now },
    });

    expect(result?.status).toBe("SUCCEEDED");
    expect(result?.amount).toBe(26);
    expect(prismaMock.refund.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ paymentId: "pay-1", amount: 26, status: "PENDING", requestedById: null }),
      })
    );
    expect(mpMock.refundPayment).toHaveBeenCalledWith("123456789", 26);
    expect(prismaMock.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "refunded", statusDetail: "prorated_refunded_partial" }),
      })
    );
  });

  it("plano anual usado 2/12 → devolve ~10/12 com multa de 20% (R$ 200 → R$ 134)", async () => {
    prismaMock.payment.findFirst.mockResolvedValue(
      makePayment({ transactionAmount: 200 })
    );
    const now = new Date("2026-03-02T00:00:00.000Z"); // 60 dias após início
    const result = await issueProratedRefund({
      barbershopId: "shop-1",
      subscription: makeSubscription({
        plan: { billingCycle: "YEARLY" },
        startDate: new Date("2026-01-01T00:00:00.000Z"),
      }),
      deps: { mp: mpMock as any, abacate: abacateMock as any, now },
    });

    expect(result?.status).toBe("SUCCEEDED");
    expect(result?.amount).toBe(134);
    expect(mpMock.refundPayment).toHaveBeenCalledWith("123456789", 134);
  });

  it("AbacatePay envia PIX proporcional em vez de refund total", async () => {
    prismaMock.payment.findFirst.mockResolvedValue(
      makePayment({ transactionAmount: 200, provider: "ABACATEPAY", mpPaymentId: null })
    );
    const now = new Date("2026-03-02T00:00:00.000Z");
    const result = await issueProratedRefund({
      barbershopId: "shop-1",
      subscription: makeSubscription({
        plan: { billingCycle: "YEARLY" },
        startDate: new Date("2026-01-01T00:00:00.000Z"),
      }),
      cancelReason: "price",
      pixKey: "cliente@email.com",
      pixKeyType: "EMAIL",
      deps: { mp: mpMock as any, abacate: abacateMock as any, now },
    });

    expect(abacateMock.sendPix).toHaveBeenCalledWith(
      expect.objectContaining({
        amountCents: 13400,
        externalId: "refund-refund-1",
        pixKey: "cliente@email.com",
        pixKeyType: "EMAIL",
      })
    );
    expect(result?.status).toBe("SUCCEEDED");
    expect(prismaMock.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ statusDetail: "prorated_refunded_via_pix" }),
      })
    );
  });

  it("Asaas faz ESTORNO PARCIAL real sem chave PIX (ano 2/12 → R$ 134 com multa)", async () => {
    prismaMock.payment.findFirst.mockResolvedValue(
      makePayment({
        transactionAmount: 200,
        provider: "ASAAS",
        providerPaymentId: "pay_asaas123",
        mpPaymentId: null,
      })
    );
    const now = new Date("2026-03-02T00:00:00.000Z"); // 60 dias após início
    const result = await issueProratedRefund({
      barbershopId: "shop-1",
      subscription: makeSubscription({
        plan: { billingCycle: "YEARLY" },
        startDate: new Date("2026-01-01T00:00:00.000Z"),
      }),
      cancelReason: "price",
      deps: { mp: mpMock as any, abacate: abacateMock as any, asaas: asaasMock as any, now },
    });

    expect(result?.status).toBe("SUCCEEDED");
    expect(result?.amount).toBe(134);
    expect(asaasMock.refundPayment).toHaveBeenCalledWith(
      "pay_asaas123",
      134,
      "Reembolso proporcional automático com multa de 20% (price)"
    );
    expect(prismaMock.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "refunded", statusDetail: "prorated_refunded_partial" }),
      })
    );
  });

  it("Asaas sem providerPaymentId → refund FAILED com mensagem clara", async () => {
    prismaMock.payment.findFirst.mockResolvedValue(
      makePayment({
        transactionAmount: 200,
        provider: "ASAAS",
        providerPaymentId: null,
        mpPaymentId: null,
      })
    );
    const result = await issueProratedRefund({
      barbershopId: "shop-1",
      subscription: makeSubscription({
        plan: { billingCycle: "YEARLY" },
        startDate: new Date("2026-01-01T00:00:00.000Z"),
      }),
      deps: { mp: mpMock as any, abacate: abacateMock as any, asaas: asaasMock as any, now: new Date("2026-03-02T00:00:00.000Z") },
    });

    expect(result?.status).toBe("FAILED");
    expect(prismaMock.refund.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) })
    );
    expect(asaasMock.refundPayment).not.toHaveBeenCalled();
  });

  it("não gera refund quando não há pagamento aprovado", async () => {
    prismaMock.payment.findFirst.mockResolvedValue(null);
    const result = await issueProratedRefund({
      barbershopId: "shop-1",
      subscription: makeSubscription(),
      deps: { mp: mpMock as any, abacate: abacateMock as any },
    });
    expect(result).toBeNull();
    expect(prismaMock.refund.create).not.toHaveBeenCalled();
  });

  it("não gera refund quando já existe reembolso SUCCEEDED (idempotência)", async () => {
    prismaMock.refund.findFirst.mockResolvedValue({ id: "refund-existente", status: "SUCCEEDED" });
    const result = await issueProratedRefund({
      barbershopId: "shop-1",
      subscription: makeSubscription(),
      deps: { mp: mpMock as any, abacate: abacateMock as any },
    });
    expect(result).toBeNull();
    expect(prismaMock.refund.create).not.toHaveBeenCalled();
  });

  it("não gera refund quando o período pago já foi consumido (proporcional ≤ 0)", async () => {
    const now = new Date("2026-12-31T00:00:00.000Z");
    const result = await issueProratedRefund({
      barbershopId: "shop-1",
      subscription: makeSubscription({
        plan: { billingCycle: "MONTHLY" },
        startDate: new Date("2026-01-01T00:00:00.000Z"),
      }),
      deps: { mp: mpMock as any, abacate: abacateMock as any, now },
    });
    expect(result).toBeNull();
  });

  it("AbacatePay sem chave PIX → refund FAILED com mensagem clara", async () => {
    prismaMock.payment.findFirst.mockResolvedValue(
      makePayment({ transactionAmount: 200, provider: "ABACATEPAY", mpPaymentId: null })
    );
    const result = await issueProratedRefund({
      barbershopId: "shop-1",
      subscription: makeSubscription({
        plan: { billingCycle: "YEARLY" },
        startDate: new Date("2026-01-01T00:00:00.000Z"),
      }),
      deps: { mp: mpMock as any, abacate: abacateMock as any, now: new Date("2026-03-02T00:00:00.000Z") },
    });

    expect(result?.status).toBe("FAILED");
    expect(prismaMock.refund.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) })
    );
    expect(prismaMock.adminNotification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ title: "Falha no reembolso proporcional automático" }),
      })
    );
  });

  it("falha no provider → refund FAILED e retorna FAILED (cancelamento continua)", async () => {
    mpMock.refundPayment.mockRejectedValue(new Error("Saldo insuficiente"));
    const result = await issueProratedRefund({
      barbershopId: "shop-1",
      subscription: makeSubscription(),
      deps: {
        mp: mpMock as any,
        abacate: abacateMock as any,
        now: new Date("2026-01-11T00:00:00.000Z"),
      },
    });

    expect(result?.status).toBe("FAILED");
    expect(prismaMock.refund.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "FAILED", errorMessage: "Saldo insuficiente" }),
      })
    );
  });

  it("usa a última invoice PAID como início do período atual (renovação)", async () => {
    prismaMock.invoice.findFirst.mockResolvedValue({
      paidAt: new Date("2026-02-01T00:00:00.000Z"), // renovação recente
    });
    const now = new Date("2026-02-11T00:00:00.000Z"); // 10 dias após renovação
    const result = await issueProratedRefund({
      barbershopId: "shop-1",
      subscription: makeSubscription({
        plan: { billingCycle: "MONTHLY" },
        startDate: new Date("2025-01-01T00:00:00.000Z"),
      }),
      deps: { mp: mpMock as any, abacate: abacateMock as any, now },
    });

    // 10/30 usados → 20/30 de volta de 100 → 67 → multa 20% → 54
    expect(result?.amount).toBe(54);
  });
});