import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SubscribeUseCase } from "./SubscribeUseCase";
import { MockPaymentRepository } from "@/modules/payments/infra/repositories/mocks/MockPaymentRepository";

const prismaMock = vi.hoisted(() => ({
  barbershop: { findUnique: vi.fn() },
  plan: { findUnique: vi.fn() },
  subscription: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
    findUniqueOrThrow: vi.fn(),
  },
  invoice: { create: vi.fn(), update: vi.fn(), deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
  $transaction: vi.fn(),
}));

vi.mock("@/libs/prismaClient", () => ({
  prisma: prismaMock,
}));

vi.mock("@/modules/referrals/services/referralService", () => ({
  qualifyReferralOnPayment: vi.fn().mockResolvedValue(undefined),
  revokeReferralOnCancellation: vi.fn().mockResolvedValue(undefined),
}));

const NOW = new Date("2026-01-15T12:00:00.000Z");

function makeYearlyPlan() {
  return {
    id: "plan-yearly",
    name: "Pro Anual",
    price: 1199,
    active: true,
    description: null,
    abacateProductId: "prod_1",
    billingCycle: "YEARLY",
  };
}

function makeSubscription() {
  return {
    id: "sub-1",
    barbershopId: "shop-1",
    planId: "plan-yearly",
    status: "ACTIVE",
    startDate: NOW,
    endDate: new Date(NOW.getTime() + 30 * 86400000),
    cancelDate: null,
    cancelReason: null,
    referralCreditDays: 0,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function makeFullSubscription() {
  return {
    ...makeSubscription(),
    plan: { id: "plan-yearly", name: "Pro Anual", price: 1199, billingCycle: "YEARLY" },
    invoices: [
      {
        id: "inv-1",
        subscriptionId: "sub-1",
        amount: 1199,
        dueDate: new Date(NOW.getTime() + 30 * 86400000),
        paidAt: new Date(),
        status: "PAID",
        paymentMethod: "credit_card",
        createdAt: NOW,
      },
    ],
  };
}

describe("SubscribeUseCase — endDate anual via cartão", () => {
  let repo: MockPaymentRepository;
  let mpService: {
    createCardPayment: ReturnType<typeof vi.fn>;
    createPixPayment: ReturnType<typeof vi.fn>;
    getPaymentById: ReturnType<typeof vi.fn>;
    cancelPayment: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    repo = new MockPaymentRepository();
    mpService = {
      createCardPayment: vi.fn(),
      createPixPayment: vi.fn(),
      getPaymentById: vi.fn(),
      cancelPayment: vi.fn(),
    };

    prismaMock.barbershop.findUnique.mockResolvedValue({
      id: "shop-1",
      name: "Barbearia Teste",
      active: true,
      createdAt: NOW,
    });
    prismaMock.plan.findUnique.mockResolvedValue(makeYearlyPlan());
    prismaMock.subscription.findUnique.mockResolvedValue(null);
    prismaMock.subscription.upsert.mockResolvedValue(makeSubscription());
    prismaMock.invoice.create.mockResolvedValue({
      id: "inv-1",
      subscriptionId: "sub-1",
      amount: 1199,
      dueDate: new Date(NOW.getTime() + 30 * 86400000),
      status: "PENDING",
      paymentMethod: "credit_card",
    });
    prismaMock.$transaction.mockImplementation(async (fnOrOps: any) => {
      if (typeof fnOrOps === "function") {
        return fnOrOps(prismaMock);
      }
      return Promise.all(fnOrOps);
    });
    prismaMock.subscription.update.mockResolvedValue({});
    prismaMock.invoice.update.mockResolvedValue({});
    prismaMock.subscription.findUniqueOrThrow.mockResolvedValue(
      makeFullSubscription()
    );

    mpService.createCardPayment.mockResolvedValue({
      id: 987654321,
      status: "approved",
      status_detail: "accredited",
      payment_type_id: "credit_card",
      payment_method_id: "visa",
      transaction_amount: 1199,
      currency_id: "BRL",
      description: "Assinatura AgendAI — Pro Anual",
      external_reference: "ag-sub-sub-1-inv-inv-1",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("[FIX] plano YEARLY aprovado via cartão define endDate ≈ now + 365 dias", async () => {
    const useCase = new SubscribeUseCase(
      mpService as any,
      {} as any,
      {} as any,
      repo as any
    );

    const result = await useCase.execute(
      {
        barbershopId: "shop-1",
        planId: "plan-yearly",
        paymentMethod: "credit_card",
        cardToken: "card-token",
        cardPaymentMethodId: "visa",
        payerEmail: "owner@example.com",
        payerFirstName: "Dono",
        payerLastName: "Teste",
        payerIdentification: { type: "CPF", number: "12345678901" },
      },
      { role: "OWNER", barbershopId: "shop-1" }
    );

    expect(result.payment?.status).toBe("approved");

    const subUpdateCall = prismaMock.subscription.update.mock.calls.find(
      (c) => c[0].where?.id === "sub-1"
    );
    expect(subUpdateCall).toBeTruthy();
    expect(subUpdateCall![0].data.status).toBe("ACTIVE");
    const expectedEndDate = new Date(NOW.getTime() + 365 * 86400000);
    expect(subUpdateCall![0].data.endDate).toEqual(expectedEndDate);
    expect(subUpdateCall![0].data.endDate.getTime() - NOW.getTime()).toBe(
      365 * 86400000
    );
  });

  it("[FIX] plano MONTHLY aprovado via cartão mantém endDate ≈ now + 30 dias", async () => {
    prismaMock.plan.findUnique.mockResolvedValue({
      ...makeYearlyPlan(),
      id: "plan-monthly",
      name: "Pro Mensal",
      price: 149,
      billingCycle: "MONTHLY",
    });
    prismaMock.subscription.findUniqueOrThrow.mockResolvedValue({
      ...makeFullSubscription(),
      plan: { id: "plan-monthly", name: "Pro Mensal", price: 149, billingCycle: "MONTHLY" },
    });

    const useCase = new SubscribeUseCase(
      mpService as any,
      {} as any,
      {} as any,
      repo as any
    );

    await useCase.execute(
      {
        barbershopId: "shop-1",
        planId: "plan-monthly",
        paymentMethod: "credit_card",
        cardToken: "card-token",
        cardPaymentMethodId: "visa",
        payerEmail: "owner@example.com",
        payerIdentification: { type: "CPF", number: "12345678901" },
      },
      { role: "OWNER", barbershopId: "shop-1" }
    );

    const subUpdateCall = prismaMock.subscription.update.mock.calls.find(
      (c) => c[0].where?.id === "sub-1"
    );
    expect(subUpdateCall![0].data.endDate.getTime() - NOW.getTime()).toBe(
      30 * 86400000
    );
  });

  it("[ASAAS] PIX embutido: cria cobrança PIX, salva QR Code e mantém trial até webhook", async () => {
    const asaasService = {
      ensureCustomer: vi.fn().mockResolvedValue("cus_1"),
      createPayment: vi.fn().mockResolvedValue({
        id: "pay_asaas123",
        status: "PENDING",
        value: 1199,
        billingType: "PIX",
        externalReference: "ag-sub-sub-1-inv-inv-1",
        pixQrCode: {
          encodedImage: "iVBORw0KGgoAAAANSUhEUg...",
          payload: "00020126580014br.gov.bcb.pix",
          expirationDate: "2026-01-16T12:00:00.000Z",
        },
      }),
      getPixQrCode: vi.fn(),
    };

    const useCase = new SubscribeUseCase(
      mpService as any,
      {} as any,
      asaasService as any,
      repo as any
    );

    const result = await useCase.execute(
      {
        barbershopId: "shop-1",
        planId: "plan-yearly",
        paymentMethod: "asaas",
        payerEmail: "owner@example.com",
        payerFirstName: "Dono",
        payerIdentification: { type: "CPF", number: "12345678901" },
      },
      { role: "OWNER", barbershopId: "shop-1" }
    );

    expect(asaasService.ensureCustomer).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "owner@example.com",
        cpfCnpj: "12345678901",
        externalReference: "ag-customer-shop-1",
      })
    );
    expect(asaasService.createPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_1",
        billingType: "PIX",
        value: 1199,
        externalReference: "ag-sub-sub-1-inv-inv-1",
      })
    );
    expect(asaasService.getPixQrCode).not.toHaveBeenCalled();
    expect(result.payment?.provider).toBe("ASAAS");
    expect(result.payment?.providerPaymentId).toBe("pay_asaas123");
    expect(result.payment?.paymentMethod).toBe("pix");
    expect(result.payment?.checkoutUrl).toBeNull();
    expect(result.payment?.pixQrCode?.qrCode).toBe("00020126580014br.gov.bcb.pix");
    expect(result.payment?.pixQrCode?.qrCodeBase64).toBe("iVBORw0KGgoAAAANSUhEUg...");
    expect(result.payment?.status).toBe("pending");

    const upsertCall = prismaMock.subscription.upsert.mock.calls[0][0];
    expect(upsertCall.create.status).toBe("TRIALING");
    expect(upsertCall.create.endDate).toBeNull();

    const invoiceCreate = prismaMock.invoice.create.mock.calls[0][0].data;
    expect(invoiceCreate.status).toBe("PENDING");
    expect(invoiceCreate.paymentMethod).toBe("pix");
  });

  it("[ASAAS] cartão embutido: envia creditCard ao Asaas e mantém trial até webhook", async () => {
    const asaasService = {
      ensureCustomer: vi.fn().mockResolvedValue("cus_1"),
      createPayment: vi.fn().mockResolvedValue({
        id: "pay_asaas_card",
        status: "PENDING",
        value: 1199,
        billingType: "CREDIT_CARD",
        externalReference: "ag-sub-sub-1-inv-inv-1",
      }),
      getPixQrCode: vi.fn(),
    };

    const useCase = new SubscribeUseCase(
      mpService as any,
      {} as any,
      asaasService as any,
      repo as any
    );

    const result = await useCase.execute(
      {
        barbershopId: "shop-1",
        planId: "plan-yearly",
        paymentMethod: "asaas",
        asaasBillingType: "CREDIT_CARD",
        asaasCreditCard: {
          holderName: "Dono Teste",
          number: "4000000000000002",
          expiryMonth: "12",
          expiryYear: "2030",
          ccv: "123",
          postalCode: "01310100",
          addressNumber: "100",
          phone: "11999999999",
        },
        remoteIp: "127.0.0.1",
        payerEmail: "owner@example.com",
        payerFirstName: "Dono",
        payerLastName: "Teste",
        payerIdentification: { type: "CPF", number: "12345678901" },
      },
      { role: "OWNER", barbershopId: "shop-1" }
    );

    expect(asaasService.createPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_1",
        billingType: "CREDIT_CARD",
        creditCard: {
          holderName: "Dono Teste",
          number: "4000000000000002",
          expiryMonth: "12",
          expiryYear: "2030",
          ccv: "123",
        },
        creditCardHolderInfo: expect.objectContaining({
          name: "Dono Teste",
          email: "owner@example.com",
          cpfCnpj: "12345678901",
          postalCode: "01310100",
          addressNumber: "100",
          phone: "11999999999",
        }),
        remoteIp: "127.0.0.1",
      })
    );
    expect(result.payment?.provider).toBe("ASAAS");
    expect(result.payment?.providerPaymentId).toBe("pay_asaas_card");
    expect(result.payment?.paymentMethod).toBe("credit_card");
    expect(result.payment?.pixQrCode).toBeNull();
    expect(result.payment?.status).toBe("pending");

    const invoiceCreate = prismaMock.invoice.create.mock.calls[0][0].data;
    expect(invoiceCreate.paymentMethod).toBe("credit_card");
  });

  it("[FIX] TRIALING pode gerar PIX Asaas sem 409 e permanece TRIALING até o webhook", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({
      ...makeSubscription(),
      status: "TRIALING",
      endDate: null,
    });
    prismaMock.subscription.upsert.mockResolvedValue({
      ...makeSubscription(),
      status: "TRIALING",
    });

    const asaasService = {
      ensureCustomer: vi.fn().mockResolvedValue("cus_1"),
      createPayment: vi.fn().mockResolvedValue({
        id: "pay_asaas_trial",
        status: "PENDING",
        value: 1199,
        billingType: "PIX",
        externalReference: "ag-sub-sub-1-inv-inv-1",
        pixQrCode: {
          encodedImage: "base64qr",
          payload: "00020126",
          expirationDate: "2026-01-16T12:00:00.000Z",
        },
      }),
      getPixQrCode: vi.fn(),
    };

    const useCase = new SubscribeUseCase(
      mpService as any,
      {} as any,
      asaasService as any,
      repo as any
    );

    const result = await useCase.execute(
      {
        barbershopId: "shop-1",
        planId: "plan-yearly",
        paymentMethod: "asaas",
        asaasBillingType: "PIX",
        payerEmail: "owner@example.com",
      },
      { role: "OWNER", barbershopId: "shop-1" }
    );

    expect(result.payment?.pixQrCode?.qrCode).toBe("00020126");
    const upsertCall = prismaMock.subscription.upsert.mock.calls[0][0];
    expect(upsertCall.update.status).toBe("TRIALING");
    expect(upsertCall.update.planId).toBe("plan-yearly");
  });

  it("[FIX] PIX pendente não troca o plano de uma assinatura já ativa", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({
      ...makeSubscription(),
      planId: "plan-current",
      status: "ACTIVE",
    });

    const asaasService = {
      ensureCustomer: vi.fn().mockResolvedValue("cus_1"),
      createPayment: vi.fn().mockResolvedValue({
        id: "pay_pending",
        status: "PENDING",
        pixQrCode: { encodedImage: "base64qr", payload: "00020126", expirationDate: "2026-01-16T12:00:00.000Z" },
      }),
      getPixQrCode: vi.fn(),
    };
    const useCase = new SubscribeUseCase(mpService as any, {} as any, asaasService as any, repo as any);

    await useCase.execute(
      {
        barbershopId: "shop-1",
        planId: "plan-yearly",
        paymentMethod: "asaas",
        asaasBillingType: "PIX",
        payerEmail: "owner@example.com",
      },
      { role: "OWNER", barbershopId: "shop-1" }
    );

    const upsertCall = prismaMock.subscription.upsert.mock.calls[0][0];
    expect(upsertCall.update.planId).toBe("plan-current");
    expect(prismaMock.invoice.create.mock.calls[0][0].data.planId).toBe("plan-yearly");
  });
});
