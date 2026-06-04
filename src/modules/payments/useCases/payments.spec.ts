import { describe, it, expect, beforeEach, vi } from "vitest";
import { MockPaymentRepository } from "@/modules/payments/infra/repositories/mocks/MockPaymentRepository";
import { CreateCardPaymentUseCase } from "./createCardPayment/CreateCardPaymentUseCase";
import { CreatePixPaymentUseCase } from "./createPixPayment/CreatePixPaymentUseCase";
import { GetPaymentStatusUseCase } from "./getPaymentStatus/GetPaymentStatusUseCase";
import { ListPaymentsUseCase } from "./listPayments/ListPaymentsUseCase";
import { CancelPaymentUseCase } from "./cancelPayment/CancelPaymentUseCase";
import { ProcessWebhookUseCase } from "./processWebhook/ProcessWebhookUseCase";
import { AppError } from "@/shared/errors/AppError";

// ── Mock do MercadoPagoService ──────────────────────────────────────────────
const mockMpCard = vi.fn();
const mockMpPix = vi.fn();
const mockMpGet = vi.fn();
const mockMpCancel = vi.fn();

const mpServiceMock = {
  createCardPayment: mockMpCard,
  createPixPayment: mockMpPix,
  getPaymentById: mockMpGet,
  cancelPayment: mockMpCancel
} as any;

// ── Helpers ─────────────────────────────────────────────────────────────────
function makeMpCardResponse(overrides = {}) {
  return {
    id: 123456,
    status: "approved",
    status_detail: "accredited",
    payment_type_id: "credit_card",
    payment_method_id: "visa",
    transaction_amount: 50,
    currency_id: "BRL",
    description: "Corte",
    external_reference: "ext-ref-1",
    ...overrides
  };
}

function makeMpPixResponse(overrides = {}) {
  return {
    id: 789012,
    status: "pending",
    status_detail: "pending_waiting_transfer",
    payment_type_id: "bank_transfer",
    payment_method_id: "pix",
    transaction_amount: 40,
    currency_id: "BRL",
    description: "Barba",
    external_reference: "ext-pix-1",
    date_of_expiration: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    point_of_interaction: {
      transaction_data: {
        qr_code: "00020101...",
        qr_code_base64: "iVBORw0K..."
      }
    },
    ...overrides
  };
}

// ── Testes ───────────────────────────────────────────────────────────────────
let repo: MockPaymentRepository;

beforeEach(() => {
  repo = new MockPaymentRepository();
  vi.clearAllMocks();
});

describe("CreateCardPaymentUseCase", () => {
  it("cria pagamento com cartão com sucesso", async () => {
    mockMpCard.mockResolvedValue(makeMpCardResponse());
    const useCase = new CreateCardPaymentUseCase(repo as any, mpServiceMock);

    const result = await useCase.execute({
      token: "card-token",
      transactionAmount: 50,
      description: "Corte",
      installments: 1,
      paymentMethodId: "visa",
      payer: { email: "cliente@test.com", identification: { type: "CPF", number: "12345678901" } },
      barbershopId: "shop-1"
    });

    expect(result.status).toBe("approved");
    expect(result.paymentMethod).toBe("credit_card");
    expect(result.transactionAmount).toBe(50);
  });

  it("lança erro quando valor menor que R$ 0,50", async () => {
    const useCase = new CreateCardPaymentUseCase(repo as any, mpServiceMock);
    await expect(
      useCase.execute({
        token: "t",
        transactionAmount: 0.3,
        description: "x",
        installments: 1,
        paymentMethodId: "visa",
        payer: { email: "a@b.com", identification: { type: "CPF", number: "12345678901" } },
        barbershopId: "shop-1"
      })
    ).rejects.toBeInstanceOf(AppError);
  });

  it("lança AppError quando MP rejeita o cartão", async () => {
    mockMpCard.mockRejectedValue(new Error("invalid_card_token"));
    const useCase = new CreateCardPaymentUseCase(repo as any, mpServiceMock);
    await expect(
      useCase.execute({
        token: "bad-token",
        transactionAmount: 50,
        description: "Corte",
        installments: 1,
        paymentMethodId: "visa",
        payer: { email: "a@b.com", identification: { type: "CPF", number: "12345678901" } },
        barbershopId: "shop-1"
      })
    ).rejects.toBeInstanceOf(AppError);
  });
});

describe("CreatePixPaymentUseCase", () => {
  it("cria pagamento PIX com QR code", async () => {
    mockMpPix.mockResolvedValue(makeMpPixResponse());
    const useCase = new CreatePixPaymentUseCase(repo as any, mpServiceMock);

    const result = await useCase.execute({
      transactionAmount: 40,
      description: "Barba",
      payer: { email: "cliente@test.com" },
      barbershopId: "shop-1"
    });

    expect(result.paymentMethod).toBe("pix");
    expect(result.pixQrCode?.qrCode).toBe("00020101...");
    expect(result.status).toBe("pending");
  });

  it("lança AppError quando MP não retorna QR code", async () => {
    mockMpPix.mockResolvedValue({
      ...makeMpPixResponse(),
      point_of_interaction: { transaction_data: {} }
    });
    const useCase = new CreatePixPaymentUseCase(repo as any, mpServiceMock);
    await expect(
      useCase.execute({
        transactionAmount: 40,
        description: "Barba",
        payer: { email: "a@b.com" },
        barbershopId: "shop-1"
      })
    ).rejects.toBeInstanceOf(AppError);
  });
});

describe("GetPaymentStatusUseCase", () => {
  it("retorna pagamento sem sync quando status é aprovado", async () => {
    mockMpCard.mockResolvedValue(makeMpCardResponse());
    const createUseCase = new CreateCardPaymentUseCase(repo as any, mpServiceMock);
    const created = await createUseCase.execute({
      token: "t",
      transactionAmount: 50,
      description: "x",
      installments: 1,
      paymentMethodId: "visa",
      payer: { email: "a@b.com", identification: { type: "CPF", number: "12345678901" } },
      barbershopId: "shop-1"
    });

    const getUseCase = new GetPaymentStatusUseCase(repo as any, mpServiceMock);
    const fetched = await getUseCase.execute(created.id);
    expect(fetched.id).toBe(created.id);
    expect(mockMpGet).not.toHaveBeenCalled();
  });

  it("sincroniza com MP quando status é pending", async () => {
    mockMpPix.mockResolvedValue(makeMpPixResponse());
    const createUseCase = new CreatePixPaymentUseCase(repo as any, mpServiceMock);
    const created = await createUseCase.execute({
      transactionAmount: 40,
      description: "x",
      payer: { email: "a@b.com" },
      barbershopId: "shop-1"
    });

    mockMpGet.mockResolvedValue({ ...makeMpPixResponse(), status: "approved", status_detail: "accredited" });
    const getUseCase = new GetPaymentStatusUseCase(repo as any, mpServiceMock);
    const updated = await getUseCase.execute(created.id);

    expect(mockMpGet).toHaveBeenCalledOnce();
    expect(updated.status).toBe("approved");
  });

  it("lança AppError para id inexistente", async () => {
    const useCase = new GetPaymentStatusUseCase(repo as any, mpServiceMock);
    await expect(useCase.execute("not-found")).rejects.toBeInstanceOf(AppError);
  });
});

describe("ListPaymentsUseCase", () => {
  it("lista pagamentos por barbearia", async () => {
    mockMpCard.mockResolvedValue(makeMpCardResponse());
    const createUseCase = new CreateCardPaymentUseCase(repo as any, mpServiceMock);
    await createUseCase.execute({
      token: "t",
      transactionAmount: 50,
      description: "x",
      installments: 1,
      paymentMethodId: "visa",
      payer: { email: "a@b.com", identification: { type: "CPF", number: "12345678901" } },
      barbershopId: "shop-1"
    });

    const listUseCase = new ListPaymentsUseCase(repo as any);
    const result = await listUseCase.execute("shop-1");
    expect(result.data.length).toBe(1);
    expect(result.total).toBe(1);
  });
});

describe("CancelPaymentUseCase", () => {
  it("cancela pagamento pendente", async () => {
    mockMpPix.mockResolvedValue(makeMpPixResponse());
    const createUseCase = new CreatePixPaymentUseCase(repo as any, mpServiceMock);
    const created = await createUseCase.execute({
      transactionAmount: 40,
      description: "x",
      payer: { email: "a@b.com" },
      barbershopId: "shop-1"
    });

    mockMpCancel.mockResolvedValue({ ...makeMpPixResponse(), status: "cancelled", status_detail: "by_collector" });
    const cancelUseCase = new CancelPaymentUseCase(repo as any, mpServiceMock);
    const cancelled = await cancelUseCase.execute(created.id);

    expect(cancelled.status).toBe("cancelled");
  });

  it("lança AppError ao tentar cancelar pagamento já aprovado", async () => {
    mockMpCard.mockResolvedValue(makeMpCardResponse());
    const createUseCase = new CreateCardPaymentUseCase(repo as any, mpServiceMock);
    const created = await createUseCase.execute({
      token: "t",
      transactionAmount: 50,
      description: "x",
      installments: 1,
      paymentMethodId: "visa",
      payer: { email: "a@b.com", identification: { type: "CPF", number: "12345678901" } },
      barbershopId: "shop-1"
    });

    const cancelUseCase = new CancelPaymentUseCase(repo as any, mpServiceMock);
    await expect(cancelUseCase.execute(created.id)).rejects.toBeInstanceOf(AppError);
  });

  it("lança AppError para id inexistente", async () => {
    const useCase = new CancelPaymentUseCase(repo as any, mpServiceMock);
    await expect(useCase.execute("not-found")).rejects.toBeInstanceOf(AppError);
  });
});

describe("ProcessWebhookUseCase", () => {
  it("ignora payload que não é do tipo payment", async () => {
    const useCase = new ProcessWebhookUseCase(repo as any, mpServiceMock);
    await useCase.execute({ type: "subscription", data: { id: "1" } } as any);
    expect(mockMpGet).not.toHaveBeenCalled();
  });

  it("atualiza status ao receber webhook válido", async () => {
    mockMpPix.mockResolvedValue(makeMpPixResponse());
    const createUseCase = new CreatePixPaymentUseCase(repo as any, mpServiceMock);
    await createUseCase.execute({
      transactionAmount: 40,
      description: "x",
      payer: { email: "a@b.com" },
      barbershopId: "shop-1"
    });

    mockMpGet.mockResolvedValue({ ...makeMpPixResponse(), status: "approved", status_detail: "accredited" });
    const webhookUseCase = new ProcessWebhookUseCase(repo as any, mpServiceMock);
    await webhookUseCase.execute({ type: "payment", data: { id: "789012" } } as any);

    const payment = await repo.findByMpPaymentId(789012);
    expect(payment?.status).toBe("approved");
  });
});
