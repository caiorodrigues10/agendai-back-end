import { describe, it, expect, beforeEach, vi } from "vitest";
import { MockPaymentRepository }     from "@/modules/payments/infra/repositories/mocks/MockPaymentRepository";
import { CreateCardPaymentUseCase }  from "./createCardPayment/CreateCardPaymentUseCase";
import { CreatePixPaymentUseCase }   from "./createPixPayment/CreatePixPaymentUseCase";
import { GetPaymentStatusUseCase }   from "./getPaymentStatus/GetPaymentStatusUseCase";
import { ListPaymentsUseCase }       from "./listPayments/ListPaymentsUseCase";
import { CancelPaymentUseCase }      from "./cancelPayment/CancelPaymentUseCase";
import { ProcessWebhookUseCase }     from "./processWebhook/ProcessWebhookUseCase";
import { AppError }                  from "@/shared/errors/AppError";

// ── Mock do MercadoPagoService ─────────────────────────────────────────────────
const mockMpCard   = vi.fn();
const mockMpPix    = vi.fn();
const mockMpGet    = vi.fn();
const mockMpCancel = vi.fn();

const mpServiceMock = {
  createCardPayment: mockMpCard,
  createPixPayment:  mockMpPix,
  getPaymentById:    mockMpGet,
  cancelPayment:     mockMpCancel
} as any;

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeMpCardResponse(overrides: Record<string, unknown> = {}) {
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

function makeMpPixResponse(overrides: Record<string, unknown> = {}) {
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
      transaction_data: { qr_code: "00020101...", qr_code_base64: "iVBORw0K..." }
    },
    ...overrides
  };
}

// ── Setup ─────────────────────────────────────────────────────────────────────
let repo: MockPaymentRepository;

beforeEach(() => {
  repo = new MockPaymentRepository();
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
describe("CreateCardPaymentUseCase", () => {
  it("cria pagamento com cartão com sucesso", async () => {
    mockMpCard.mockResolvedValue(makeMpCardResponse());
    const useCase = new CreateCardPaymentUseCase(repo as any, mpServiceMock);
    const result  = await useCase.execute({
      token: "card-token", transactionAmount: 50, description: "Corte",
      installments: 1, paymentMethodId: "visa",
      payer: { email: "a@b.com", identification: { type: "CPF", number: "12345678901" } },
      barbershopId: "shop-1"
    });
    expect(result.status).toBe("approved");
    expect(result.paymentMethod).toBe("credit_card");
    expect(typeof result.mpPaymentId).toBe("string");
    expect(result.mpPaymentId).toBe("123456");
  });

  it("lança AppError quando valor menor que R$ 0,50", async () => {
    const useCase = new CreateCardPaymentUseCase(repo as any, mpServiceMock);
    await expect(useCase.execute({
      token: "t", transactionAmount: 0.3, description: "x",
      installments: 1, paymentMethodId: "visa",
      payer: { email: "a@b.com", identification: { type: "CPF", number: "12345678901" } },
      barbershopId: "shop-1"
    })).rejects.toBeInstanceOf(AppError);
  });

  it("lança AppError quando MP rejeita o cartão", async () => {
    mockMpCard.mockRejectedValue(new Error("invalid_card_token"));
    const useCase = new CreateCardPaymentUseCase(repo as any, mpServiceMock);
    await expect(useCase.execute({
      token: "bad", transactionAmount: 50, description: "Corte",
      installments: 1, paymentMethodId: "visa",
      payer: { email: "a@b.com", identification: { type: "CPF", number: "12345678901" } },
      barbershopId: "shop-1"
    })).rejects.toBeInstanceOf(AppError);
  });

  it("[IMP-1] lança 403 quando não-admin tenta criar pagamento para outra barbearia", async () => {
    const useCase = new CreateCardPaymentUseCase(repo as any, mpServiceMock);
    const err = await useCase.execute(
      {
        token: "t", transactionAmount: 50, description: "Corte",
        installments: 1, paymentMethodId: "visa",
        payer: { email: "a@b.com", identification: { type: "CPF", number: "12345678901" } },
        barbershopId: "shop-2"
      },
      { role: "EMPLOYEE", barbershopId: "shop-1" }
    ).catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(403);
  });

  it("[IMP-1] permite MASTER_ADMIN criar pagamento para qualquer barbearia", async () => {
    mockMpCard.mockResolvedValue(makeMpCardResponse());
    const useCase = new CreateCardPaymentUseCase(repo as any, mpServiceMock);
    const result  = await useCase.execute(
      {
        token: "t", transactionAmount: 50, description: "Corte",
        installments: 1, paymentMethodId: "visa",
        payer: { email: "a@b.com", identification: { type: "CPF", number: "12345678901" } },
        barbershopId: "shop-99"
      },
      { role: "MASTER_ADMIN" }
    );
    expect(result.status).toBe("approved");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("CreatePixPaymentUseCase", () => {
  it("cria pagamento PIX com QR code", async () => {
    mockMpPix.mockResolvedValue(makeMpPixResponse());
    const useCase = new CreatePixPaymentUseCase(repo as any, mpServiceMock);
    const result  = await useCase.execute({
      transactionAmount: 40, description: "Barba",
      payer: { email: "a@b.com" }, barbershopId: "shop-1"
    });
    expect(result.paymentMethod).toBe("pix");
    expect(result.pixQrCode?.qrCode).toBe("00020101...");
    expect(result.mpPaymentId).toBe("789012");
  });

  it("lança AppError quando MP não retorna QR code", async () => {
    mockMpPix.mockResolvedValue({
      ...makeMpPixResponse(),
      point_of_interaction: { transaction_data: {} }
    });
    const useCase = new CreatePixPaymentUseCase(repo as any, mpServiceMock);
    await expect(useCase.execute({
      transactionAmount: 40, description: "Barba",
      payer: { email: "a@b.com" }, barbershopId: "shop-1"
    })).rejects.toBeInstanceOf(AppError);
  });

  it("[IMP-1] lança 403 quando OWNER tenta criar PIX para outra barbearia", async () => {
    const useCase = new CreatePixPaymentUseCase(repo as any, mpServiceMock);
    const err = await useCase.execute(
      { transactionAmount: 40, description: "Barba", payer: { email: "a@b.com" }, barbershopId: "shop-2" },
      { role: "OWNER", barbershopId: "shop-1" }
    ).catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("GetPaymentStatusUseCase", () => {
  it("retorna pagamento sem sync quando status é aprovado", async () => {
    mockMpCard.mockResolvedValue(makeMpCardResponse());
    const created = await new CreateCardPaymentUseCase(repo as any, mpServiceMock).execute({
      token: "t", transactionAmount: 50, description: "x",
      installments: 1, paymentMethodId: "visa",
      payer: { email: "a@b.com", identification: { type: "CPF", number: "12345678901" } },
      barbershopId: "shop-1"
    });
    const fetched = await new GetPaymentStatusUseCase(repo as any, mpServiceMock).execute(created.id);
    expect(fetched.id).toBe(created.id);
    expect(mockMpGet).not.toHaveBeenCalled();
  });

  it("sincroniza com MP quando status é pending", async () => {
    mockMpPix.mockResolvedValue(makeMpPixResponse());
    const created = await new CreatePixPaymentUseCase(repo as any, mpServiceMock).execute({
      transactionAmount: 40, description: "x", payer: { email: "a@b.com" }, barbershopId: "shop-1"
    });
    mockMpGet.mockResolvedValue({
      ...makeMpPixResponse(), status: "approved", status_detail: "accredited"
    });
    const updated = await new GetPaymentStatusUseCase(repo as any, mpServiceMock).execute(created.id);
    expect(mockMpGet).toHaveBeenCalledOnce();
    // FIX-4: getPaymentById deve receber string, não Number
    expect(mockMpGet).toHaveBeenCalledWith("789012");
    expect(updated.status).toBe("approved");
  });

  it("[IMP-4] retorna cache e loga warning quando MP falha no sync", async () => {
    mockMpPix.mockResolvedValue(makeMpPixResponse());
    const created = await new CreatePixPaymentUseCase(repo as any, mpServiceMock).execute({
      transactionAmount: 40, description: "x", payer: { email: "a@b.com" }, barbershopId: "shop-1"
    });
    mockMpGet.mockRejectedValue(new Error("MP timeout"));
    const warnSpy = vi.fn();
    const fetched = await new GetPaymentStatusUseCase(repo as any, mpServiceMock)
      .execute(created.id, false, { warn: warnSpy });
    expect(fetched.status).toBe("pending");
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toContain("Falha ao sincronizar");
  });

  it("lança AppError para id inexistente", async () => {
    await expect(
      new GetPaymentStatusUseCase(repo as any, mpServiceMock).execute("not-found")
    ).rejects.toBeInstanceOf(AppError);
  });

  it("[SEC] lança 403 quando EMPLOYEE tenta consultar pagamento de outra barbearia", async () => {
    mockMpCard.mockResolvedValue(makeMpCardResponse());
    const created = await new CreateCardPaymentUseCase(repo as any, mpServiceMock).execute({
      token: "t", transactionAmount: 50, description: "x",
      installments: 1, paymentMethodId: "visa",
      payer: { email: "a@b.com", identification: { type: "CPF", number: "12345678901" } },
      barbershopId: "shop-1"
    });
    const err = await new GetPaymentStatusUseCase(repo as any, mpServiceMock)
      .execute(created.id, false, undefined, { role: "EMPLOYEE", barbershopId: "shop-2" })
      .catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(403);
  });

  it("[SEC] permite EMPLOYEE consultar pagamento da própria barbearia", async () => {
    mockMpCard.mockResolvedValue(makeMpCardResponse());
    const created = await new CreateCardPaymentUseCase(repo as any, mpServiceMock).execute({
      token: "t", transactionAmount: 50, description: "x",
      installments: 1, paymentMethodId: "visa",
      payer: { email: "a@b.com", identification: { type: "CPF", number: "12345678901" } },
      barbershopId: "shop-1"
    });
    const result = await new GetPaymentStatusUseCase(repo as any, mpServiceMock)
      .execute(created.id, false, undefined, { role: "EMPLOYEE", barbershopId: "shop-1" });
    expect(result.id).toBe(created.id);
  });

  it("[SEC] permite MASTER_ADMIN consultar pagamento de qualquer barbearia", async () => {
    mockMpCard.mockResolvedValue(makeMpCardResponse());
    const created = await new CreateCardPaymentUseCase(repo as any, mpServiceMock).execute({
      token: "t", transactionAmount: 50, description: "x",
      installments: 1, paymentMethodId: "visa",
      payer: { email: "a@b.com", identification: { type: "CPF", number: "12345678901" } },
      barbershopId: "shop-1"
    });
    const result = await new GetPaymentStatusUseCase(repo as any, mpServiceMock)
      .execute(created.id, false, undefined, { role: "MASTER_ADMIN" });
    expect(result.id).toBe(created.id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("ListPaymentsUseCase", () => {
  it("lista pagamentos por barbearia", async () => {
    mockMpCard.mockResolvedValue(makeMpCardResponse());
    await new CreateCardPaymentUseCase(repo as any, mpServiceMock).execute({
      token: "t", transactionAmount: 50, description: "x",
      installments: 1, paymentMethodId: "visa",
      payer: { email: "a@b.com", identification: { type: "CPF", number: "12345678901" } },
      barbershopId: "shop-1"
    });
    const result = await new ListPaymentsUseCase(repo as any).execute("shop-1");
    expect(result.data.length).toBe(1);
    expect(result.total).toBe(1);
  });

  it("[FIX-3] MASTER_ADMIN sem barbershopId lista todos os pagamentos", async () => {
    mockMpCard.mockResolvedValue(makeMpCardResponse({ id: 1 }));
    mockMpPix.mockResolvedValue(makeMpPixResponse({ id: 2 }));
    await new CreateCardPaymentUseCase(repo as any, mpServiceMock).execute({
      token: "t", transactionAmount: 50, description: "x",
      installments: 1, paymentMethodId: "visa",
      payer: { email: "a@b.com", identification: { type: "CPF", number: "12345678901" } },
      barbershopId: "shop-1"
    });
    await new CreatePixPaymentUseCase(repo as any, mpServiceMock).execute({
      transactionAmount: 40, description: "x", payer: { email: "a@b.com" }, barbershopId: "shop-2"
    });
    // undefined = sem filtro de barbearia (acesso global de admin)
    const result = await new ListPaymentsUseCase(repo as any).execute(undefined);
    expect(result.data.length).toBe(2);
    expect(result.total).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("CancelPaymentUseCase", () => {
  it("cancela pagamento pendente", async () => {
    mockMpPix.mockResolvedValue(makeMpPixResponse());
    const created = await new CreatePixPaymentUseCase(repo as any, mpServiceMock).execute({
      transactionAmount: 40, description: "x", payer: { email: "a@b.com" }, barbershopId: "shop-1"
    });
    mockMpCancel.mockResolvedValue({
      ...makeMpPixResponse(), status: "cancelled", status_detail: "by_collector"
    });
    const cancelled = await new CancelPaymentUseCase(repo as any, mpServiceMock).execute(created.id);
    expect(cancelled.status).toBe("cancelled");
    // FIX-4: cancelPayment deve receber string
    expect(mockMpCancel).toHaveBeenCalledWith("789012");
  });

  it("[FIX-1] retorna idempotentemente quando pagamento já está cancelado", async () => {
    mockMpPix.mockResolvedValue(makeMpPixResponse());
    const created = await new CreatePixPaymentUseCase(repo as any, mpServiceMock).execute({
      transactionAmount: 40, description: "x", payer: { email: "a@b.com" }, barbershopId: "shop-1"
    });
    // Simula webhook chegando antes: atualiza status para cancelled
    await repo.updateStatus(created.id, { status: "cancelled", statusDetail: "by_collector" });
    // Chamada de cancel não deve ir ao MP nem lançar erro
    const result = await new CancelPaymentUseCase(repo as any, mpServiceMock).execute(created.id);
    expect(result.status).toBe("cancelled");
    expect(mockMpCancel).not.toHaveBeenCalled();
  });

  it("lança AppError ao tentar cancelar pagamento já aprovado", async () => {
    mockMpCard.mockResolvedValue(makeMpCardResponse());
    const created = await new CreateCardPaymentUseCase(repo as any, mpServiceMock).execute({
      token: "t", transactionAmount: 50, description: "x",
      installments: 1, paymentMethodId: "visa",
      payer: { email: "a@b.com", identification: { type: "CPF", number: "12345678901" } },
      barbershopId: "shop-1"
    });
    await expect(
      new CancelPaymentUseCase(repo as any, mpServiceMock).execute(created.id)
    ).rejects.toBeInstanceOf(AppError);
  });

  it("lança AppError para id inexistente", async () => {
    await expect(
      new CancelPaymentUseCase(repo as any, mpServiceMock).execute("not-found")
    ).rejects.toBeInstanceOf(AppError);
  });

  it("[SEC] lança 403 quando EMPLOYEE tenta cancelar pagamento", async () => {
    mockMpPix.mockResolvedValue(makeMpPixResponse());
    const created = await new CreatePixPaymentUseCase(repo as any, mpServiceMock).execute({
      transactionAmount: 40, description: "x", payer: { email: "a@b.com" }, barbershopId: "shop-1"
    });
    const err = await new CancelPaymentUseCase(repo as any, mpServiceMock)
      .execute(created.id, { role: "EMPLOYEE", barbershopId: "shop-1" })
      .catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(403);
  });

  it("[SEC] lança 403 quando OWNER tenta cancelar pagamento de outra barbearia", async () => {
    mockMpPix.mockResolvedValue(makeMpPixResponse());
    const created = await new CreatePixPaymentUseCase(repo as any, mpServiceMock).execute({
      transactionAmount: 40, description: "x", payer: { email: "a@b.com" }, barbershopId: "shop-1"
    });
    const err = await new CancelPaymentUseCase(repo as any, mpServiceMock)
      .execute(created.id, { role: "OWNER", barbershopId: "shop-2" })
      .catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(403);
  });

  it("[SEC] permite OWNER cancelar pagamento da própria barbearia", async () => {
    mockMpPix.mockResolvedValue(makeMpPixResponse());
    const created = await new CreatePixPaymentUseCase(repo as any, mpServiceMock).execute({
      transactionAmount: 40, description: "x", payer: { email: "a@b.com" }, barbershopId: "shop-1"
    });
    mockMpCancel.mockResolvedValue({
      ...makeMpPixResponse(), status: "cancelled", status_detail: "by_collector"
    });
    const result = await new CancelPaymentUseCase(repo as any, mpServiceMock)
      .execute(created.id, { role: "OWNER", barbershopId: "shop-1" });
    expect(result.status).toBe("cancelled");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("ProcessWebhookUseCase", () => {
  it("ignora payload que não é do tipo payment", async () => {
    await new ProcessWebhookUseCase(repo as any, mpServiceMock)
      .execute({ type: "subscription", data: { id: "1" } } as any);
    expect(mockMpGet).not.toHaveBeenCalled();
  });

  it("[SEC] processa webhook com data.id numérico (sem perda de precisão)", async () => {
    mockMpPix.mockResolvedValue(makeMpPixResponse());
    await new CreatePixPaymentUseCase(repo as any, mpServiceMock).execute({
      transactionAmount: 40, description: "x", payer: { email: "a@b.com" }, barbershopId: "shop-1"
    });
    mockMpGet.mockResolvedValue({
      ...makeMpPixResponse(), status: "approved", status_detail: "accredited"
    });
    // MP pode enviar data.id como número em alguns eventos
    await new ProcessWebhookUseCase(repo as any, mpServiceMock)
      .execute({ type: "payment", data: { id: 789012 as any } } as any);
    const payment = await repo.findByMpPaymentId("789012");
    expect(payment?.status).toBe("approved");
  });

  it("atualiza status ao receber webhook válido", async () => {
    mockMpPix.mockResolvedValue(makeMpPixResponse());
    await new CreatePixPaymentUseCase(repo as any, mpServiceMock).execute({
      transactionAmount: 40, description: "x", payer: { email: "a@b.com" }, barbershopId: "shop-1"
    });
    mockMpGet.mockResolvedValue({
      ...makeMpPixResponse(), status: "approved", status_detail: "accredited"
    });
    await new ProcessWebhookUseCase(repo as any, mpServiceMock)
      .execute({ type: "payment", data: { id: "789012" } } as any);
    const payment = await repo.findByMpPaymentId("789012");
    expect(payment?.status).toBe("approved");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FIX-2: Validação de transactionAmount com ponto flutuante
// ─────────────────────────────────────────────────────────────────────────────
describe("[FIX-2] paymentSchemas — transactionAmount", async () => {
  const { createCardPaymentSchema, createPixPaymentSchema } =
    await import("@/modules/payments/schemas/paymentSchemas");

  const baseCard = {
    token: "t", description: "x", installments: 1, paymentMethodId: "visa",
    payer: { email: "a@b.com", identification: { type: "CPF" as const, number: "12345678901" } },
    barbershopId: "3fa85f64-5717-4562-b3fc-2c963f66afa6"
  };

  const basePix = {
    description: "x",
    payer: { email: "a@b.com" },
    barbershopId: "3fa85f64-5717-4562-b3fc-2c963f66afa6"
  };

  it("aceita R$ 49,99 no schema de cartão", () => {
    expect(() => createCardPaymentSchema.parse({ ...baseCard, transactionAmount: 49.99 })).not.toThrow();
  });

  it("aceita R$ 49,99 no schema de PIX", () => {
    expect(() => createPixPaymentSchema.parse({ ...basePix, transactionAmount: 49.99 })).not.toThrow();
  });

  it("aceita valores inteiros", () => {
    expect(() => createCardPaymentSchema.parse({ ...baseCard, transactionAmount: 100 })).not.toThrow();
  });

  it("rejeita valores negativos", () => {
    expect(() => createCardPaymentSchema.parse({ ...baseCard, transactionAmount: -10 })).toThrow();
  });

  it("rejeita mais de 2 casas decimais", () => {
    expect(() => createCardPaymentSchema.parse({ ...baseCard, transactionAmount: 49.999 })).toThrow();
  });
});
