import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AsaasService } from "./AsaasService";

describe("AsaasService", () => {
  let service: AsaasService;
  const prevKey = process.env.ASAAS_API_KEY;
  const prevUrl = process.env.ASAAS_API_URL;

  beforeEach(() => {
    process.env.ASAAS_API_KEY = "test-api-key";
    delete process.env.ASAAS_API_URL;
    service = new AsaasService();
  });

  afterEach(() => {
    if (prevKey === undefined) delete process.env.ASAAS_API_KEY;
    else process.env.ASAAS_API_KEY = prevKey;
    if (prevUrl === undefined) delete process.env.ASAAS_API_URL;
    else process.env.ASAAS_API_URL = prevUrl;
    vi.restoreAllMocks();
  });

  function mockFetch(status: number, body: unknown) {
    const text = JSON.stringify(body);
    return vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({
        ok: status >= 200 && status < 300,
        status,
        text: async () => text,
        json: async () => body,
      } as Response);
  }

  it("usa produção por padrão e header access_token", async () => {
    const fetchMock = mockFetch(200, { id: "pay_1" });

    await service.getPayment("pay_1");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.asaas.com/v3/payments/pay_1",
      expect.objectContaining({
        headers: expect.objectContaining({ access_token: "test-api-key" }),
      })
    );
  });

  it("aceita ASAAS_API_URL para sandbox", async () => {
    process.env.ASAAS_API_URL = "https://api-sandbox.asaas.com";
    service = new AsaasService();
    const fetchMock = mockFetch(200, { id: "pay_1" });

    await service.getPayment("pay_1");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api-sandbox.asaas.com/v3/payments/pay_1",
      expect.anything()
    );
  });

  it("createPayment envia customer, billingType UNDEFINED, value e externalReference", async () => {
    const fetchMock = mockFetch(200, {
      id: "pay_abc123",
      status: "PENDING",
      value: 140,
      invoiceUrl: "https://www.asaas.com/i/pay_abc123",
    });

    const result = await service.createPayment({
      customer: "cus_1",
      billingType: "UNDEFINED",
      value: 140,
      dueDate: "2026-09-18",
      description: "Assinatura AgendAI — Essencial",
      externalReference: "ag-sub-1-inv-1",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.asaas.com/v3/payments",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          customer: "cus_1",
          billingType: "UNDEFINED",
          value: 140,
          dueDate: "2026-09-18",
          description: "Assinatura AgendAI — Essencial",
          externalReference: "ag-sub-1-inv-1",
        }),
      })
    );
    expect(result.id).toBe("pay_abc123");
    expect(result.invoiceUrl).toBe("https://www.asaas.com/i/pay_abc123");
  });

  it("refundPayment sem value faz estorno integral", async () => {
    const fetchMock = mockFetch(200, { id: "ref_1", status: "REFUNDED" });

    await service.refundPayment("pay_abc123");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.asaas.com/v3/payments/pay_abc123/refund",
      expect.objectContaining({ method: "POST", body: undefined })
    );
  });

  it("refundPayment com value faz estorno PARCIAL", async () => {
    const fetchMock = mockFetch(200, { id: "ref_1", status: "REFUND_REQUESTED" });

    const result = await service.refundPayment("pay_abc123", 167, "Motivo");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.asaas.com/v3/payments/pay_abc123/refund",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ value: 167, description: "Motivo" }),
      })
    );
    expect(result.status).toBe("REFUND_REQUESTED");
  });

  it("ensureCustomer reutiliza cliente existente pelo CPF", async () => {
    const fetchMock = mockFetch(200, { data: [{ id: "cus_existing" }] });

    const id = await service.ensureCustomer({
      name: "Dono",
      email: "dono@email.com",
      cpfCnpj: "12345678901",
    });

    expect(id).toBe("cus_existing");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.asaas.com/v3/customers?cpfCnpj=12345678901",
      expect.anything()
    );
  });

  it("ensureCustomer cria cliente quando não existe", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ data: [] }),
        json: async () => ({ data: [] }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: "cus_new" }),
        json: async () => ({ id: "cus_new" }),
      } as Response);

    const id = await service.ensureCustomer({ email: "dono@email.com" });

    expect(id).toBe("cus_new");
    expect(fetchMock.mock.calls[1][0]).toBe(
      "https://api.asaas.com/v3/customers"
    );
  });

  it("lança erro descritivo com os erros da API", async () => {
    mockFetch(400, {
      errors: [{ code: "invalid_cpf_cnpj", description: "CPF inválido" }],
    });

    await expect(service.ensureCustomer({ email: "x@y.com" })).rejects.toMatchObject({
      code: "PAYMENT_PROVIDER_REJECTED",
      message: expect.stringContaining("invalid_cpf_cnpj"),
    });
  });

  it("lança erro claro sem ASAAS_API_KEY", async () => {
    delete process.env.ASAAS_API_KEY;
    service = new AsaasService();
    await expect(service.getPayment("pay_1")).rejects.toThrow(
      /ASAAS_API_KEY/
    );
  });

  it("mapStatusToLocal: RECEIVED/CONFIRMED → approved; REFUNDED → refunded", () => {
    expect(service.mapStatusToLocal("RECEIVED")).toBe("approved");
    expect(service.mapStatusToLocal("CONFIRMED")).toBe("approved");
    expect(service.mapStatusToLocal("PENDING")).toBe("pending");
    expect(service.mapStatusToLocal("OVERDUE")).toBe("cancelled");
    expect(service.mapStatusToLocal("DELETED")).toBe("cancelled");
    expect(service.mapStatusToLocal("REFUNDED")).toBe("refunded");
    expect(service.mapStatusToLocal("REFUND_REQUESTED")).toBe("in_process");
    expect(service.mapStatusToLocal("CHARGEBACK_REQUESTED")).toBe(
      "charged_back"
    );
    expect(service.mapStatusToLocal("CHARGEBACK_DISPUTE")).toBe(
      "in_mediation"
    );
    expect(service.mapStatusToLocal("AWAITING_CHARGEBACK_REVERSAL")).toBe(
      "in_mediation"
    );
  });

  it("mapEventToLocalStatus: eventos de cobrança mapeados; demais → null", () => {
    expect(service.mapEventToLocalStatus("PAYMENT_CONFIRMED")).toBe("approved");
    expect(service.mapEventToLocalStatus("PAYMENT_RECEIVED")).toBe("approved");
    expect(service.mapEventToLocalStatus("PAYMENT_OVERDUE")).toBe("cancelled");
    expect(service.mapEventToLocalStatus("PAYMENT_DELETED")).toBe("cancelled");
    expect(service.mapEventToLocalStatus("PAYMENT_REFUNDED")).toBe("refunded");
    expect(service.mapEventToLocalStatus("PAYMENT_CHARGEBACK_REQUESTED")).toBe(
      "charged_back"
    );
    expect(service.mapEventToLocalStatus("PAYMENT_CHARGEBACK_DISPUTE")).toBe(
      "in_mediation"
    );
    expect(service.mapEventToLocalStatus("PAYMENT_CREATED")).toBeNull();
    expect(service.mapEventToLocalStatus("PAYMENT_UPDATED")).toBeNull();
    expect(service.mapEventToLocalStatus("PAYMENT_DUNNING_REQUESTED")).toBeNull();
  });
});
