import { describe, it, expect, beforeEach, vi } from "vitest";
import { RefundPaymentUseCase } from "./RefundPaymentUseCase";
import { AppError } from "@/shared/errors/AppError";

const prismaMock = vi.hoisted(() => ({
  payment: { findUnique: vi.fn(), update: vi.fn() },
  refund: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    findUniqueOrThrow: vi.fn(),
  },
  subscription: { findUnique: vi.fn(), update: vi.fn() },
  invoice: { updateMany: vi.fn(), update: vi.fn() },
  adminNotification: { create: vi.fn() },
  auditLog: { create: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock("@/libs/prismaClient", () => ({
  prisma: prismaMock,
}));

vi.mock("@/modules/referrals/services/referralService", () => ({
  revokeReferralOnCancellation: vi.fn().mockResolvedValue(undefined),
  qualifyReferralOnPayment: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/shared/infra/http/middlewares/subscriptionAccessCache", () => ({
  invalidateSubscriptionCache: vi.fn(),
}));

function makePayment(overrides: Record<string, unknown> = {}) {
  return {
    id: "pay-1",
    mpPaymentId: null,
    provider: "ABACATEPAY",
    providerPaymentId: "bill_abc123",
    checkoutUrl: "https://app.abacatepay.com/pay/bill_abc123",
    status: "approved",
    statusDetail: "checkout.completed",
    paymentMethod: "payment_link",
    transactionAmount: 99,
    currency: "BRL",
    description: "Assinatura AgendAI — Pro",
    barbershopId: "shop-1",
    externalReference:
      "ag-sub-3fa85f64-5717-4562-b3fc-2c963f66afa6-inv-7ba0f7d2-0b91-4f4c-b3ac-1c5f3a0e6c11",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("RefundPaymentUseCase", () => {
  const admin = { id: "admin-1", role: "MASTER_ADMIN" };
  let abacateMock: { refundCheckout: ReturnType<typeof vi.fn> };
  let mpMock: { refundPayment: ReturnType<typeof vi.fn> };
  let asaasMock: { refundPayment: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation((ops: any[]) =>
      Promise.all(ops)
    );
    prismaMock.adminNotification.create.mockResolvedValue({});
    prismaMock.auditLog.create.mockResolvedValue({});
    prismaMock.subscription.update.mockResolvedValue({});
    prismaMock.refund.update.mockResolvedValue({});
    prismaMock.refund.findFirst.mockResolvedValue(null);
    prismaMock.refund.findUnique.mockResolvedValue(null);
    prismaMock.invoice.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.invoice.update.mockResolvedValue({});
    abacateMock = {
      refundCheckout: vi
        .fn()
        .mockResolvedValue({ refundId: "tran_refund789", status: "REFUNDED" }),
    };
    mpMock = {
      refundPayment: vi.fn().mockResolvedValue({
        id: 123456789,
        status: "refunded",
        status_detail: "refunded_by_admin",
      }),
    };
    asaasMock = {
      refundPayment: vi.fn().mockResolvedValue({
        id: "asaas-refund-1",
        status: "REFUNDED",
      }),
    };
  });

  it("retorna 400 se já existe refund SUCCEEDED (idempotente)", async () => {
    prismaMock.payment.findUnique.mockResolvedValue(makePayment());
    prismaMock.refund.findFirst.mockResolvedValue({
      id: "refund-x",
      status: "SUCCEEDED",
    });

    const useCase = new RefundPaymentUseCase({} as any, abacateMock as any, {} as any);
    const err = await useCase
      .execute("pay-1", "Motivo válido", admin)
      .catch((e) => e);

    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(400);
    expect((err as AppError).message).toContain("já reembolsado");
    expect(abacateMock.refundCheckout).not.toHaveBeenCalled();
  });

  it("retorna 400 se pagamento não está approved", async () => {
    prismaMock.payment.findUnique.mockResolvedValue(
      makePayment({ status: "pending" })
    );

    const useCase = new RefundPaymentUseCase({} as any, abacateMock as any, {} as any);
    const err = await useCase
      .execute("pay-1", "Motivo válido", admin)
      .catch((e) => e);

    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(400);
    expect((err as AppError).message).toContain("status atual");
  });

  it("retorna 403 para role que não é MASTER_ADMIN", async () => {
    prismaMock.payment.findUnique.mockResolvedValue(makePayment());

    const useCase = new RefundPaymentUseCase({} as any, abacateMock as any, {} as any);
    const err = await useCase
      .execute("pay-1", "Motivo válido", { id: "owner-1", role: "OWNER" })
      .catch((e) => e);

    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(403);
  });

  it("retorna 404 para pagamento inexistente", async () => {
    prismaMock.payment.findUnique.mockResolvedValue(null);

    const useCase = new RefundPaymentUseCase({} as any, abacateMock as any, {} as any);
    const err = await useCase
      .execute("pay-1", "Motivo válido", admin)
      .catch((e) => e);

    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(404);
  });

  it("retorna 400 se pagamento não tem identificação no provedor", async () => {
    prismaMock.payment.findUnique.mockResolvedValue(
      makePayment({ provider: "ABACATEPAY", providerPaymentId: null })
    );

    const useCase = new RefundPaymentUseCase({} as any, abacateMock as any, {} as any);
    const err = await useCase
      .execute("pay-1", "Motivo válido", admin)
      .catch((e) => e);

    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(400);
    expect((err as AppError).message).toContain("sem identificação");
  });

  it("sucesso ABACATEPAY: refund SUCCEEDED + payment refunded + subscription CANCELED", async () => {
    prismaMock.payment.findUnique.mockResolvedValue(makePayment());
    prismaMock.refund.findFirst.mockResolvedValue(null);
    prismaMock.refund.create.mockResolvedValue({
      id: "refund-1",
      status: "PENDING",
      paymentId: "pay-1",
      barbershopId: "shop-1",
      amount: 9900,
      reason: "Motivo válido",
      provider: "ABACATEPAY",
      requestedById: "admin-1",
    });
    prismaMock.subscription.findUnique.mockResolvedValue({
      id: "sub-1",
      barbershopId: "shop-1",
      planId: "plan-1",
      status: "ACTIVE",
      startDate: new Date("2025-06-01T00:00:00.000Z"),
      endDate: new Date("2026-06-01T00:00:00.000Z"),
      cancelDate: null,
      cancelReason: null,
      plan: { id: "plan-1", name: "Pro" },
    });
    prismaMock.refund.findUniqueOrThrow.mockResolvedValue({
      id: "refund-1",
      status: "SUCCEEDED",
      providerRefundId: "tran_refund789",
      completedAt: new Date(),
    });

    const useCase = new RefundPaymentUseCase({} as any, abacateMock as any, {} as any);
    const result = await useCase.execute("pay-1", "Motivo válido", admin);

    expect(result.status).toBe("SUCCEEDED");
    expect(abacateMock.refundCheckout).toHaveBeenCalledWith(
      "bill_abc123",
      "Motivo válido"
    );

    const refundUpdate = prismaMock.refund.update.mock.calls.find(
      (c) => c[0].data?.status === "SUCCEEDED"
    );
    expect(refundUpdate).toBeTruthy();
    expect(refundUpdate![0].data.providerRefundId).toBe("tran_refund789");

    const paymentUpdate = prismaMock.payment.update.mock.calls[0][0];
    expect(paymentUpdate.data.status).toBe("refunded");
    expect(paymentUpdate.data.statusDetail).toBe("refunded_by_admin");
    expect(paymentUpdate.data.rawResponse).toBeNull();
    expect(paymentUpdate.data.providerSnapshot.data).toMatchObject({ status: "REFUNDED" });

    const subUpdate = prismaMock.subscription.update.mock.calls[0][0];
    expect(subUpdate.data.status).toBe("CANCELED");
    expect(subUpdate.data.cancelDate).toBeInstanceOf(Date);
    // Reembolso devolve o dinheiro → acesso revogado imediatamente (endDate = now)
    expect(subUpdate.data.endDate).toBeInstanceOf(Date);

    const invoiceUpdateMany = prismaMock.invoice.updateMany.mock.calls[0][0];
    expect(invoiceUpdateMany.where.subscriptionId).toBe("sub-1");
    expect(invoiceUpdateMany.data.status).toBe("CANCELLED");

    const invoiceUpdate = prismaMock.invoice.updateMany.mock.calls.find(
      (c) => c[0].where?.id === "7ba0f7d2-0b91-4f4c-b3ac-1c5f3a0e6c11"
    );
    expect(invoiceUpdate?.[0].data.status).toBe("CANCELLED");
    expect(prismaMock.adminNotification.create).toHaveBeenCalled();
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "admin-1",
          action: "REFUND_PAYMENT",
        }),
      })
    );
  });

  it("sucesso MERCADOPAGO: chama refundPayment com mpPaymentId string", async () => {
    prismaMock.payment.findUnique.mockResolvedValue(
      makePayment({
        provider: "MERCADOPAGO",
        mpPaymentId: BigInt("123456789"),
        providerPaymentId: null,
      })
    );
    prismaMock.refund.findFirst.mockResolvedValue(null);
    prismaMock.refund.create.mockResolvedValue({
      id: "refund-2",
      status: "PENDING",
    });
    prismaMock.subscription.findUnique.mockResolvedValue(null);
    prismaMock.refund.findUniqueOrThrow.mockResolvedValue({
      id: "refund-2",
      status: "SUCCEEDED",
      providerRefundId: "123456789",
    });

    const useCase = new RefundPaymentUseCase(mpMock as any, {} as any, {} as any);
    const result = await useCase.execute("pay-1", "Motivo válido", admin);

    expect(result.status).toBe("SUCCEEDED");
    expect(mpMock.refundPayment).toHaveBeenCalledWith("123456789");

    const paymentUpdate = prismaMock.payment.update.mock.calls[0][0];
    expect(paymentUpdate.data.status).toBe("refunded");
    expect(paymentUpdate.data.rawResponse).toBeNull();
    expect(paymentUpdate.data.providerSnapshot.data).toMatchObject({ status: "refunded" });
  });

  it("sucesso ASAAS: chama refundPayment com providerPaymentId (estorno integral)", async () => {
    prismaMock.payment.findUnique.mockResolvedValue(
      makePayment({
        provider: "ASAAS",
        providerPaymentId: "pay_asaas123",
        mpPaymentId: null,
      })
    );
    prismaMock.refund.findFirst.mockResolvedValue(null);
    prismaMock.refund.create.mockResolvedValue({
      id: "refund-asaas",
      status: "PENDING",
    });
    prismaMock.subscription.findUnique.mockResolvedValue(null);
    prismaMock.refund.findUniqueOrThrow.mockResolvedValue({
      id: "refund-asaas",
      status: "SUCCEEDED",
      providerRefundId: "asaas-refund-1",
    });

    const useCase = new RefundPaymentUseCase(
      {} as any,
      {} as any,
      asaasMock as any
    );
    const result = await useCase.execute("pay-1", "Motivo válido", admin);

    expect(result.status).toBe("SUCCEEDED");
    expect(asaasMock.refundPayment).toHaveBeenCalledWith("pay_asaas123");

    const refundUpdate = prismaMock.refund.update.mock.calls.find(
      (c) => c[0].data?.status === "SUCCEEDED"
    );
    expect(refundUpdate![0].data.providerRefundId).toBe("asaas-refund-1");

    const paymentUpdate = prismaMock.payment.update.mock.calls[0][0];
    expect(paymentUpdate.data.status).toBe("refunded");
    expect(paymentUpdate.data.statusDetail).toBe("refunded_by_admin");
  });

  it("falha do provider: refund FAILED + 422", async () => {
    prismaMock.payment.findUnique.mockResolvedValue(makePayment());
    prismaMock.refund.findFirst.mockResolvedValue(null);
    prismaMock.refund.create.mockResolvedValue({ id: "refund-3", status: "PENDING" });
    abacateMock.refundCheckout.mockRejectedValue(
      new AppError("Saldo insuficiente na loja para realizar o reembolso", 422)
    );

    const useCase = new RefundPaymentUseCase({} as any, abacateMock as any, {} as any);
    const err = await useCase
      .execute("pay-1", "Motivo válido", admin)
      .catch((e) => e);

    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(422);

    const refundUpdate = prismaMock.refund.update.mock.calls.find(
      (c) => c[0].data?.status === "FAILED"
    );
    expect(refundUpdate).toBeTruthy();
    expect(refundUpdate![0].data.errorMessage).toContain(
      "Saldo insuficiente"
    );
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("falha do provider com erro genérico: refund FAILED + 422 com mensagem do provider", async () => {
    prismaMock.payment.findUnique.mockResolvedValue(makePayment());
    prismaMock.refund.findFirst.mockResolvedValue(null);
    prismaMock.refund.create.mockResolvedValue({ id: "refund-4", status: "PENDING" });
    abacateMock.refundCheckout.mockRejectedValue(
      new Error("AbacatePay API error 400: TRANSACTION_NOT_REFUNDABLE")
    );

    const useCase = new RefundPaymentUseCase({} as any, abacateMock as any, {} as any);
    const err = await useCase
      .execute("pay-1", "Motivo válido", admin)
      .catch((e) => e);

    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(422);

    const refundUpdate = prismaMock.refund.update.mock.calls.find(
      (c) => c[0].data?.status === "FAILED"
    );
    expect(refundUpdate![0].data.errorMessage).toContain(
      "TRANSACTION_NOT_REFUNDABLE"
    );
  });
});
