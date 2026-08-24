import { injectable } from "tsyringe";
import { AppError } from "@/shared/errors/AppError";

export interface AsaasCustomer {
  id: string;
  name?: string | null;
  email?: string | null;
  cpfCnpj?: string | null;
  externalReference?: string | null;
}

export interface AsaasPayment {
  id: string;
  status: string;
  value: number;
  dueDate: string;
  billingType?: string;
  description?: string | null;
  externalReference?: string | null;
  invoiceUrl?: string | null;
  bankSlipUrl?: string | null;
  pixQrCode?: AsaasPixQrCode | null;
  [key: string]: unknown;
}

export interface AsaasRefund {
  id: string;
  status: string;
  value: number;
  payment?: string | null;
  [key: string]: unknown;
}

export interface AsaasPixQrCode {
  encodedImage: string;
  payload: string;
  expirationDate: string;
}

export type AsaasBillingType =
  | "BOLETO"
  | "CREDIT_CARD"
  | "DEBIT_CARD"
  | "UNDEFINED"
  | "TRANSFER"
  | "DEPOSIT"
  | "PIX";

/**
 * Provider Asaas — permite ESTORNO PARCIAL de cobranças (PIX e cartão),
 * eliminando a "burla" via PIX proporcional usada no AbacatePay.
 * @see https://docs.asaas.com
 */
@injectable()
export class AsaasService {
  // Produção por padrão (mesmo padrão dos demais providers). Use
  // ASAAS_API_URL=https://api-sandbox.asaas.com para testar em sandbox.
  private readonly baseUrl =
    process.env.ASAAS_API_URL || "https://api.asaas.com";

  private get apiKey(): string {
    const key = process.env.ASAAS_API_KEY;
    if (!key) {
      throw new Error(
        "ASAAS_API_KEY não configurado nas variáveis de ambiente"
      );
    }
    return key;
  }

  private async request<T>(
    method: "GET" | "POST" | "DELETE",
    path: string,
    body?: unknown
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        access_token: this.apiKey,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const json = (await response.json()) as
      | T
      | { errors?: Array<{ code: string; description: string }> }
      | undefined;

    if (!response.ok) {
      const asaasError = json as { errors?: Array<{ code: string; description: string }> };
      const detail = asaasError?.errors
        ?.map((e) => `${e.code}: ${e.description}`)
        .join("; ");
      throw new Error(
        `Asaas API error ${response.status}: ${detail || "erro desconhecido"}`
      );
    }

    return json as T;
  }

  /**
   * Reutiliza o cliente Asaas pelo CPF/CNPJ (ou e-mail) quando já existe;
   * caso contrário cria. A cobrança Asaas exige um customer.
   * @see https://docs.asaas.com/reference/criar-novo-cliente
   */
  async ensureCustomer(input: {
    name?: string;
    email?: string;
    cpfCnpj?: string;
    externalReference?: string;
  }): Promise<string> {
    const query = new URLSearchParams();
    if (input.cpfCnpj) query.set("cpfCnpj", input.cpfCnpj);
    else if (input.email) query.set("email", input.email);

    if (query.toString()) {
      const listed = await this.request<{ data?: AsaasCustomer[] }>(
        "GET",
        `/v3/customers?${query.toString()}`
      );
      const existing = listed?.data?.[0];
      if (existing?.id) return existing.id;
    }

    const created = await this.request<AsaasCustomer>("POST", "/v3/customers", {
      name: input.name,
      email: input.email,
      cpfCnpj: input.cpfCnpj,
      externalReference: input.externalReference,
    });
    return created.id;
  }

  /**
   * Cria uma cobrança. PIX retorna pixQrCode no response; CREDIT_CARD
   * aceita `creditCard` com número (holderName/number/expiry/ccv) ou
   * `creditCardToken`, mais `creditCardHolderInfo` e `remoteIp`.
   * @see https://docs.asaas.com/reference/criar-nova-cobranca
   */
  async createPayment(input: {
    customer: string;
    billingType: AsaasBillingType;
    value: number;
    dueDate: string; // yyyy-MM-dd
    description?: string;
    externalReference?: string;
    creditCard?: Record<string, unknown>;
    /** Token vaulted (POST /v3/creditCard/tokenize) — cobra sem reenviar o cartão. */
    creditCardToken?: string;
    creditCardHolderInfo?: Record<string, unknown>;
    remoteIp?: string;
  }): Promise<AsaasPayment> {
    const payload: Record<string, unknown> = {
      customer: input.customer,
      billingType: input.billingType,
      value: input.value,
      dueDate: input.dueDate,
      description: input.description,
      externalReference: input.externalReference,
    };

    if (input.creditCardToken) {
      payload.creditCardToken = input.creditCardToken;
    } else if (input.creditCard) {
      payload.creditCard = input.creditCard;
    }
    if (input.creditCardHolderInfo) {
      payload.creditCardHolderInfo = input.creditCardHolderInfo;
    }
    if (input.remoteIp) payload.remoteIp = input.remoteIp;

    return this.request<AsaasPayment>("POST", "/v3/payments", payload);
  }

  /** Recupera uma cobrança (fonte de verdade pós-webhook / polling). */
  async getPayment(paymentId: string): Promise<AsaasPayment> {
    return this.request<AsaasPayment>(
      "GET",
      `/v3/payments/${encodeURIComponent(paymentId)}`
    );
  }

  /**
   * Cancela/remove cobrança pendente no Asaas (DELETE).
   * Cobranças já recebidas devem usar refundPayment.
   * @see https://docs.asaas.com/reference/remover-cobranca
   */
  async cancelPayment(paymentId: string): Promise<AsaasPayment> {
    const remote = await this.getPayment(paymentId);
    const status = (remote.status || "").toUpperCase();

    if (status === "DELETED" || status === "CANCELLED") {
      return remote;
    }
    if (["RECEIVED", "CONFIRMED", "REFUNDED"].includes(status)) {
      throw new AppError(
        "Cobrança Asaas já foi paga — use estorno em vez de cancelamento",
        422
      );
    }

    try {
      return await this.request<AsaasPayment>(
        "DELETE",
        `/v3/payments/${encodeURIComponent(paymentId)}`
      );
    } catch (error: any) {
      const message = String(error?.message ?? "");
      if (message.includes("422") || message.includes("invalid")) {
        throw new AppError(
          `Cancelamento remoto Asaas indisponível: ${message}`,
          422
        );
      }
      throw new AppError(
        `Falha temporária ao cancelar no Asaas: ${message || "erro de rede"}`,
        503
      );
    }
  }

  /**
   * Estorna (refunde) uma cobrança. Com `value` faz ESTORNO PARCIAL
   * (PIX permite múltiplos parciais; cartão integral ou parcial).
   * Sem `value`, estorno integral.
   * @see https://docs.asaas.com/reference/estornar-cobranca
   */
  async refundPayment(
    paymentId: string,
    valueReais?: number,
    description?: string
  ): Promise<AsaasRefund> {
    const body: Record<string, unknown> = {};
    if (valueReais != null) body.value = valueReais;
    if (description) body.description = description;
    return this.request<AsaasRefund>(
      "POST",
      `/v3/payments/${encodeURIComponent(paymentId)}/refund`,
      Object.keys(body).length > 0 ? body : undefined
    );
  }

  /** QR Code PIX de uma cobrança PIX (não aplicável a UNDEFINED). */
  async getPixQrCode(paymentId: string): Promise<AsaasPixQrCode> {
    return this.request<AsaasPixQrCode>(
      "GET",
      `/v3/payments/${encodeURIComponent(paymentId)}/pixQrCode`
    );
  }

  /**
   * Tokeniza e salva o cartão no customer **sem criar cobrança**.
   * @see https://docs.asaas.com/reference/tokenizacao-de-cartao-de-credito
   */
  async tokenizeCreditCard(input: {
    customer: string;
    creditCard: {
      holderName: string;
      number: string;
      expiryMonth: string;
      expiryYear: string;
      ccv: string;
    };
    creditCardHolderInfo: {
      name: string;
      email: string;
      cpfCnpj: string;
      postalCode: string;
      addressNumber: string;
      phone: string;
    };
    remoteIp: string;
  }): Promise<{
    creditCardToken: string;
    creditCardNumber?: string;
    creditCardBrand?: string;
  }> {
    const result = await this.request<{
      creditCardToken?: string;
      creditCardNumber?: string;
      creditCardBrand?: string;
    }>("POST", "/v3/creditCard/tokenize", {
      customer: input.customer,
      creditCard: input.creditCard,
      creditCardHolderInfo: input.creditCardHolderInfo,
      remoteIp: input.remoteIp,
    });

    if (!result.creditCardToken) {
      throw new AppError("Asaas não retornou token do cartão", 502);
    }

    return {
      creditCardToken: result.creditCardToken,
      creditCardNumber: result.creditCardNumber,
      creditCardBrand: result.creditCardBrand,
    };
  }

  /**
   * Mapeia o status de UMA COBRANÇA Asaas para o PaymentStatusEnum local.
   * CONFIRMED (pago, saldo pendente) e RECEIVED (saldo disponível) ativam.
   * REFUNDED/chargebacks seguem o mesmo tratamento de estorno do MP/Abacate.
   */
  mapStatusToLocal(
    status: string
  ): "pending" | "approved" | "in_process" | "in_mediation" | "rejected" | "cancelled" | "refunded" | "charged_back" {
    switch (status) {
      case "RECEIVED":
      case "CONFIRMED":
        return "approved";
      case "OVERDUE":
      case "CANCELLED":
      case "DELETED":
        return "cancelled";
      case "REFUNDED":
        return "refunded";
      case "REFUND_REQUESTED":
      case "REFUND_IN_PROGRESS":
        return "in_process";
      case "CHARGEBACK_REQUESTED":
        return "charged_back";
      case "CHARGEBACK_DISPUTE":
      case "AWAITING_CHARGEBACK_REVERSAL":
        return "in_mediation";
      default:
        return "pending";
    }
  }

  /**
   * Mapeia um EVENTO de webhook de cobranças para o status local.
   * Retorna null para eventos que não exigem ação (PAYMENT_CREATED,
   * PAYMENT_UPDATED, PAYMENT_DUNNING_*, PAYMENT_ANTICIPATED, etc.).
   * @see https://docs.asaas.com/docs/webhook-para-cobrancas
   */
  mapEventToLocalStatus(
    event: string
  ): "approved" | "in_mediation" | "cancelled" | "refunded" | "charged_back" | null {
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
  }
}