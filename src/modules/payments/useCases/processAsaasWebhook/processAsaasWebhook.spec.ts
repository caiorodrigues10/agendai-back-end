import { describe, it, expect, beforeEach, vi } from "vitest";
import { MockPaymentRepository } from "@/modules/payments/infra/repositories/mocks/MockPaymentRepository";
import { ProcessAsaasWebhookUseCase } from "./ProcessAsaasWebhookUseCase";

vi.mock("@/modules/subscriptions/services/handleSubscriptionPaymentWebhook", () => ({
  handleSubscriptionPaymentWebhook: vi.fn().mockResolvedValue(undefined),
}));

import { handleSubscriptionPaymentWebhook } from "@/modules/subscriptions/services/handleSubscriptionPaymentWebhook";

function makeAsaasMock() {
  return {
    mapEventToLocalStatus: vi.fn().mockImplementation((event: string) => {
      switch (event) {
        case "PAYMENT_CONFIRMED":
        case "PAYMENT_RECEIVED":
          return "approved";
        case "PAYMENT_OVERDUE":
        case "PAYMENT_DELETED":
          return "cancelled";
        case "PAYMENT_REFUNDED":
          return "refunded";
        case "PAYMENT_CHARGEBACK_REQUESTED":
          return "charged_back";
        case "PAYMENT_CHARGEBACK_DISPUTE":
        case "PAYMENT_AWAITING_CHARGEBACK_REVERSAL":
          return "in_mediation";
        default:
          return null;
      }
    }),
  };
}

describe("ProcessAsaasWebhookUseCase", () => {
  let repo: MockPaymentRepository;
  let asaas: ReturnType<typeof makeAsaasMock>;
  let useCase: ProcessAsaasWebhookUseCase;

  beforeEach(() => {
    repo = new MockPaymentRepository();
    asaas = makeAsaasMock();
    useCase = new ProcessAsaasWebhookUseCase(repo as any, asaas as any);
    vi.clearAllMocks();
  });

  it("PAYMENT_CONFIRMED → payment approved + subscription handler chamado", async () => {
    const payment = await repo.create({
      mpPaymentId: null,
      provider: "ASAAS",
      providerPaymentId: "pay_abc123",
      checkoutUrl: "https://www.asaas.com/i/pay_abc123",
      status: "pending",
      statusDetail: "PENDING",
      paymentMethod: "payment_link",
      transactionAmount: 140,
      currency: "BRL",
      description: "Assinatura",
      barbershopId: "shop-1",
      externalReference: "ag-sub-sub1-inv-inv1",
    });

    await useCase.execute({
      event: "PAYMENT_CONFIRMED",
      payment: { id: "pay_abc123", status: "CONFIRMED" },
    });

    const updated = await repo.findById(payment.id);
    expect(updated?.status).toBe("approved");
    expect(handleSubscriptionPaymentWebhook).toHaveBeenCalledWith(
      "ag-sub-sub1-inv-inv1",
      "approved"
    );
  });

  it("resolve pelo externalReference quando payment.id não bate", async () => {
    await repo.create({
      provider: "ASAAS",
      providerPaymentId: "pay_xyz",
      status: "pending",
      statusDetail: "PENDING",
      paymentMethod: "payment_link",
      transactionAmount: 140,
      currency: "BRL",
      description: "x",
      barbershopId: "shop-1",
      externalReference: "ag-sub-a-inv-b",
    });

    await useCase.execute({
      event: "PAYMENT_RECEIVED",
      payment: { id: "outro_pay", externalReference: "ag-sub-a-inv-b" },
    });

    expect(handleSubscriptionPaymentWebhook).toHaveBeenCalledWith(
      "ag-sub-a-inv-b",
      "approved"
    );
  });

  it("PAYMENT_REFUNDED → refunded + handler chamado (estorno externo)", async () => {
    const payment = await repo.create({
      provider: "ASAAS",
      providerPaymentId: "pay_chargeback",
      status: "approved",
      statusDetail: "PAYMENT_CONFIRMED",
      paymentMethod: "payment_link",
      transactionAmount: 140,
      currency: "BRL",
      description: "x",
      barbershopId: "shop-1",
      externalReference: "ag-sub-a-inv-b",
    });

    await useCase.execute({
      event: "PAYMENT_REFUNDED",
      payment: { id: "pay_chargeback", status: "REFUNDED" },
    });

    const updated = await repo.findById(payment.id);
    expect(updated?.status).toBe("refunded");
    expect(handleSubscriptionPaymentWebhook).toHaveBeenCalledWith(
      "ag-sub-a-inv-b",
      "refunded"
    );
  });

  it("PAYMENT_REFUNDED após refund local (pró-rata/admin) NÃO regride a assinatura", async () => {
    await repo.create({
      provider: "ASAAS",
      providerPaymentId: "pay_prorated",
      status: "refunded",
      statusDetail: "prorated_refunded_partial",
      paymentMethod: "payment_link",
      transactionAmount: 140,
      currency: "BRL",
      description: "x",
      barbershopId: "shop-1",
      externalReference: "ag-sub-a-inv-b",
    });

    await useCase.execute({
      event: "PAYMENT_REFUNDED",
      payment: { id: "pay_prorated", status: "REFUNDED" },
    });

    expect(handleSubscriptionPaymentWebhook).not.toHaveBeenCalled();
  });

  it("é idempotente se o pagamento já está approved", async () => {
    await repo.create({
      provider: "ASAAS",
      providerPaymentId: "pay_done",
      status: "approved",
      statusDetail: "PAYMENT_CONFIRMED",
      paymentMethod: "payment_link",
      transactionAmount: 10,
      currency: "BRL",
      description: "x",
      barbershopId: "shop-1",
      externalReference: "ag-sub-a-inv-b",
    });

    await useCase.execute({
      event: "PAYMENT_CONFIRMED",
      payment: { id: "pay_done", status: "CONFIRMED" },
    });

    expect(handleSubscriptionPaymentWebhook).not.toHaveBeenCalled();
  });

  it("CHARGEBACK_DISPUTE → in_mediation (suspende acesso)", async () => {
    await repo.create({
      provider: "ASAAS",
      providerPaymentId: "pay_dispute",
      status: "approved",
      statusDetail: "PAYMENT_CONFIRMED",
      paymentMethod: "payment_link",
      transactionAmount: 140,
      currency: "BRL",
      description: "x",
      barbershopId: "shop-1",
      externalReference: "ag-sub-a-inv-b",
    });

    await useCase.execute({
      event: "PAYMENT_CHARGEBACK_DISPUTE",
      payment: { id: "pay_dispute", status: "CHARGEBACK_DISPUTE" },
    });

    expect(handleSubscriptionPaymentWebhook).toHaveBeenCalledWith(
      "ag-sub-a-inv-b",
      "in_mediation"
    );
  });

  it("ignora evento sem mapeamento (PAYMENT_CREATED) e webhook sem payment", async () => {
    await useCase.execute({
      event: "PAYMENT_CREATED",
      payment: { id: "pay_x", status: "PENDING" },
    });
    await useCase.execute({ event: "PAYMENT_CONFIRMED" });

    expect(handleSubscriptionPaymentWebhook).not.toHaveBeenCalled();
  });

  it("ignora evento desconhecido para pagamento que não existe localmente", async () => {
    await useCase.execute({
      event: "PAYMENT_REFUNDED",
      payment: { id: "pay_nao_existe", status: "REFUNDED" },
    });

    expect(handleSubscriptionPaymentWebhook).not.toHaveBeenCalled();
  });
});