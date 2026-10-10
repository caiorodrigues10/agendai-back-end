/// <reference types="vitest/globals" />
/**
 * VERIFICAÇÃO (não commitar) — traço financeiro do RefundPaymentUseCase.
 *
 * Prova, com provedor mockado, o que o estorno grava/nao grava:
 *  1. Pagamento de SERVICO (serviceId preenchido, sem externalReference de
 *     fatura): o use case NAO cria cash_movement nem reversa commission_entry.
 *  2. Pior: se a barbearia tem assinatura ACTIVE, estornar um pagamento de
 *     SERVICO tambem cancela a assinatura (subscription.update -> CANCELED).
 */
import { RefundPaymentUseCase } from "./RefundPaymentUseCase";
import { cancelSubscriptionForBarbershop } from "@/modules/subscriptions/services/cancelSubscriptionService";

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
  cashMovement: { create: vi.fn(), createMany: vi.fn(), update: vi.fn() },
  commissionEntry: { create: vi.fn(), createMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  profitEntry: { create: vi.fn(), createMany: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock("@/libs/prismaClient", () => ({ prisma: prismaMock }));

vi.mock("@/modules/referrals/services/referralService", () => ({
  revokeReferralOnCancellation: vi.fn().mockResolvedValue(undefined),
  qualifyReferralOnPayment: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/shared/infra/http/middlewares/subscriptionAccessCache", () => ({
  invalidateSubscriptionCache: vi.fn(),
}));

vi.mock("@/modules/subscriptions/services/cancelSubscriptionService", () => ({
  cancelSubscriptionForBarbershop: vi.fn().mockResolvedValue(undefined),
}));

const cancelSubMock = vi.mocked(cancelSubscriptionForBarbershop);

/** Pagamento de SERVIÇO (não assinatura): serviceId preenchido, sem ref de fatura. */
function pagamentoServico() {
  return {
    id: "pay-servico-1",
    provider: "MERCADOPAGO",
    providerPaymentId: null,
    mpPaymentId: BigInt("123456789"),
    status: "approved",
    statusDetail: "approved",
    paymentMethod: "credit_card",
    transactionAmount: 50,
    currency: "BRL",
    description: "Corte",
    barbershopId: "shop-1",
    serviceId: "cccccccc-0000-4000-8000-000000000050",
    appointmentId: null,
    queueItemId: null,
    externalReference: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/** Pagamento de ASSINATURA: sem serviceId, com externalReference de fatura. */
function pagamentoAssinatura() {
  return {
    ...pagamentoServico(),
    id: "pay-sub-1",
    serviceId: null,
    externalReference:
      "ag-sub-3fa85f64-5717-4562-b3fc-2c963f66afa6-inv-7ba0f7d2-0b91-4f4c-b3ac-1c5f3a0e6c11",
    description: "Assinatura Agenda Já — Pro",
    transactionAmount: 99,
  };
}

function assinaturaAtiva() {
  return {
    id: "sub-1",
    barbershopId: "shop-1",
    planId: "plan-1",
    status: "ACTIVE",
    startDate: new Date("2025-06-01"),
    endDate: new Date("2026-06-01"),
    cancelDate: null,
    cancelReason: null,
    plan: { id: "plan-1", name: "Pro" },
  };
}

function montaUseCase() {
  const mp = { refundPayment: vi.fn().mockResolvedValue({ id: 999, status: "refunded" }) };
  const uc = new RefundPaymentUseCase(mp as never, {} as never, {} as never);
  return { uc, mp };
}

function ligaSucesso(payment: Record<string, unknown>, sub: unknown) {
  prismaMock.payment.findUnique.mockResolvedValue(payment);
  prismaMock.refund.findUnique.mockResolvedValue(null);
  prismaMock.refund.findFirst.mockResolvedValue(null);
  prismaMock.refund.create.mockResolvedValue({ id: "refund-1", status: "PENDING" });
  prismaMock.subscription.findUnique.mockResolvedValue(sub);
  prismaMock.refund.findUniqueOrThrow.mockResolvedValue({
    id: "refund-1",
    status: "SUCCEEDED",
    providerRefundId: "999",
  });
  prismaMock.$transaction.mockImplementation((ops: unknown[]) => Promise.all(ops));
}

const admin = { id: "admin-1", role: "MASTER_ADMIN" };

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.refund.update.mockResolvedValue({});
  prismaMock.payment.update.mockResolvedValue({});
  prismaMock.subscription.update.mockResolvedValue({});
  prismaMock.invoice.updateMany.mockResolvedValue({ count: 0 });
  prismaMock.adminNotification.create.mockResolvedValue({});
  prismaMock.auditLog.create.mockResolvedValue({});
  prismaMock.$transaction.mockImplementation((ops: unknown[]) => Promise.all(ops));
});

describe("traço financeiro do estorno (mock de provedor)", () => {
  it("pagamento de SERVIÇO: NÃO cria cash_movement nem reversal de commission_entry", async () => {
    ligaSucesso(pagamentoServico(), assinaturaAtiva());
    const { uc } = montaUseCase();

    await uc.execute("pay-servico-1", "[QA] estorno de serviço", admin);

    // 1) Nenhum lançamento de caixa (nem SERVICE_SALE negativo, nem REFUND).
    expect(prismaMock.cashMovement.create).not.toHaveBeenCalled();
    expect(prismaMock.cashMovement.createMany).not.toHaveBeenCalled();

    // 2) Nenhuma reversão de comissão.
    expect(prismaMock.commissionEntry.create).not.toHaveBeenCalled();
    expect(prismaMock.commissionEntry.createMany).not.toHaveBeenCalled();
    expect(prismaMock.commissionEntry.update).not.toHaveBeenCalled();
    expect(prismaMock.commissionEntry.updateMany).not.toHaveBeenCalled();

    // 3) Nenhum lançamento de lucro.
    expect(prismaMock.profitEntry.create).not.toHaveBeenCalled();
    expect(prismaMock.profitEntry.createMany).not.toHaveBeenCalled();

    // 4) O payment vira refunded (única mutação financeira de fato).
    const paymentUpdate = prismaMock.payment.update.mock.calls[0][0];
    expect(paymentUpdate.data.status).toBe("refunded");
  });

  it("pagamento de SERVIÇO ainda cancela a assinatura da barbearia (efeito colateral)", async () => {
    ligaSucesso(pagamentoServico(), assinaturaAtiva());
    const { uc } = montaUseCase();

    await uc.execute("pay-servico-1", "[QA] estorno de serviço", admin);

    // subscription.findUnique roda por barbershopId, sem checar se o payment é de assinatura.
    expect(prismaMock.subscription.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { barbershopId: "shop-1" } })
    );

    // Assinatura da barbearia é cancelada mesmo sendo estorno de serviço.
    expect(cancelSubMock).toHaveBeenCalledWith("shop-1", { revokeImmediately: true });
  });

  it("pagamento de ASSINATURA: também não cria cash_movement (comportamento esperado)", async () => {
    ligaSucesso(pagamentoAssinatura(), assinaturaAtiva());
    const { uc } = montaUseCase();

    await uc.execute("pay-sub-1", "[QA] estorno de assinatura", admin);

    expect(prismaMock.cashMovement.create).not.toHaveBeenCalled();
    expect(prismaMock.commissionEntry.updateMany).not.toHaveBeenCalled();

    // Para assinatura, cancelar a assinatura é esperado.
    expect(cancelSubMock).toHaveBeenCalledWith("shop-1", { revokeImmediately: true });

    // E a fatura referenciada é cancelada.
    const invoiceUpdates = prismaMock.invoice.updateMany.mock.calls.map((c) => c[0]);
    expect(invoiceUpdates.some((w) => w.where?.id === "7ba0f7d2-0b91-4f4c-b3ac-1c5f3a0e6c11")).toBe(true);
  });

  it("pagamento de SERVIÇO sem assinatura ativa: não toca subscription", async () => {
    ligaSucesso(pagamentoServico(), null);
    const { uc } = montaUseCase();

    await uc.execute("pay-servico-1", "[QA] estorno de serviço sem assinatura", admin);

    expect(cancelSubMock).not.toHaveBeenCalled();
    expect(prismaMock.cashMovement.create).not.toHaveBeenCalled();
  });
});
