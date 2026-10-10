/// <reference types="vitest/globals" />
/**
 * Verificação (b): estorno entre salões independente do papel.
 *
 * O RefundPaymentUseCase só gateia por ROLE (`admin.role !== MASTER_ADMIN`)
 * e busca o pagamento com `payment.findUnique({ where: { id } })` — sem
 * `barbershopId` em nenhum lugar. Não existe comparação entre a barbearia do
 * pagamento e qualquer tenant do solicitante.
 *
 * Este spec prova, com mock, que:
 *  1. MASTER_ADMIN sem vínculo com a barbearia do pagamento consegue estornar
 *     (cross-salon, sem checagem de tenant);
 *  2. OWNER da MESMA barbearia do pagamento também recebe 403 (o gate é papel,
 *     não tenant);
 *  3. OWNER de outra barbearia recebe 403 (idem).
 */
import { RefundPaymentUseCase } from "./RefundPaymentUseCase";

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

/** Pagamento de SERVIÇO aprovado, pertencente a `barbershopId`. */
function pagamentoDe(barbershopId: string) {
  return {
    id: `pay-${barbershopId}`,
    provider: "MERCADOPAGO",
    providerPaymentId: null,
    mpPaymentId: BigInt("987654321"),
    status: "approved",
    statusDetail: "approved",
    paymentMethod: "credit_card",
    transactionAmount: 80,
    currency: "BRL",
    description: "Corte",
    barbershopId,
    serviceId: "cccccccc-0000-4000-8000-000000000051",
    appointmentId: null,
    queueItemId: null,
    externalReference: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function ligaSucesso(payment: Record<string, unknown>) {
  prismaMock.payment.findUnique.mockResolvedValue(payment);
  prismaMock.refund.findUnique.mockResolvedValue(null);
  prismaMock.refund.findFirst.mockResolvedValue(null);
  prismaMock.refund.create.mockResolvedValue({ id: "refund-x", status: "PENDING" });
  prismaMock.refund.findUniqueOrThrow.mockResolvedValue({
    id: "refund-x",
    status: "SUCCEEDED",
    providerRefundId: "999",
  });
  prismaMock.subscription.findUnique.mockResolvedValue(null);
  prismaMock.$transaction.mockImplementation((ops: unknown[]) => Promise.all(ops));
}

function montaUseCase() {
  const mp = { refundPayment: vi.fn().mockResolvedValue({ id: 999, status: "refunded" }) };
  const uc = new RefundPaymentUseCase(mp as never, {} as never, {} as never);
  return { uc, mp };
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.payment.update.mockResolvedValue({});
  prismaMock.refund.update.mockResolvedValue({});
  prismaMock.auditLog.create.mockResolvedValue({});
  prismaMock.adminNotification.create.mockResolvedValue({});
  prismaMock.$transaction.mockImplementation((ops: unknown[]) => Promise.all(ops));
});

describe("estorno entre salões (gate por papel, não por tenant)", () => {
  it("MASTER_ADMIN sem vínculo com a barbearia do pagamento consegue estornar (cross-salon)", async () => {
    // Pagamento pertence a shop-B; o admin é MASTER_ADMIN global, sem relação
    // declarada com shop-B. O use case não compara barbershopId.
    ligaSucesso(pagamentoDe("shop-B"));
    const { uc, mp } = montaUseCase();

    await uc.execute("pay-shop-B", "[QA] estorno cross-salon", {
      id: "master-admin-1",
      role: "MASTER_ADMIN",
    });

    // A busca do pagamento é feita APENAS por id — sem escopo de tenant.
    expect(prismaMock.payment.findUnique).toHaveBeenCalledWith({
      where: { id: "pay-shop-B" },
    });
    const where = prismaMock.payment.findUnique.mock.calls[0][0]?.where ?? {};
    expect(where).not.toHaveProperty("barbershopId");

    // O estorno acontece de fato (prova de que não houve barreira de tenant).
    // MercadoPago recebe só o identificador (RefundPaymentUseCase:111).
    expect(mp.refundPayment).toHaveBeenCalledWith("987654321");
    const paymentUpdate = prismaMock.payment.update.mock.calls[0][0];
    expect(paymentUpdate.data.status).toBe("refunded");
  });

  it("OWNER da MESMA barbearia do pagamento recebe 403 (gate é papel, não tenant)", async () => {
    ligaSucesso(pagamentoDe("shop-A"));
    const { uc, mp } = montaUseCase();

    await expect(
      uc.execute("pay-shop-A", "[QA] owner da propria barbearia", {
        id: "owner-a",
        role: "OWNER",
      })
    ).rejects.toMatchObject({
      statusCode: 403,
      message: expect.stringContaining("apenas administradores"),
    });

    // Caiu no role gate (:43-48) antes de qualquer chamada ao provedor.
    expect(mp.refundPayment).not.toHaveBeenCalled();
    expect(prismaMock.refund.create).not.toHaveBeenCalled();
  });

  it("OWNER de OUTRA barbearia recebe 403 (idem)", async () => {
    ligaSucesso(pagamentoDe("shop-B"));
    const { uc, mp } = montaUseCase();

    await expect(
      uc.execute("pay-shop-B", "[QA] owner de outra barbearia", {
        id: "owner-a",
        role: "OWNER",
      })
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(mp.refundPayment).not.toHaveBeenCalled();
    expect(prismaMock.refund.create).not.toHaveBeenCalled();
  });
});
