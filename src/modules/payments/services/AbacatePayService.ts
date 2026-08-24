import { injectable } from "tsyringe";
import crypto from "node:crypto";
import { AppError } from "@/shared/errors/AppError";

/** Chave pública HMAC da AbacatePay (documentação oficial). Sobrescrevível via env. */
const DEFAULT_ABACATE_HMAC_PUBLIC_KEY =
  "t9dXRhHHo3yDEj5pVDYz0frf7q6bMKyMRmxxCPIPp3RCplBfXRxqlC6ZpiWmOqj4L63qEaeUOtrCI8P0VMUgo6iIga2ri9ogaHFs0WIIywSMg0q7RmBfybe1E5XJcfC4IW3alNqym0tXoAKkzvfEjZxV6bE0oG2zJrNNYmUCKZyV0KZ3JS8Votf9EAWWYdiDkMkpbMdPggfh1EqHlVkMiTady6jOR3hyzGEHrIz2Ret0xHKMbiqkr9HS1JhNHDX9";

export interface AbacateProduct {
  id: string;
  externalId: string;
  name: string;
  price: number;
}

export interface AbacateCustomer {
  id: string;
  email: string;
}

export interface AbacateCheckout {
  id: string;
  url: string;
  amount: number;
  status: string;
  externalId: string | null;
}

export interface CreateCheckoutInput {
  productId: string;
  externalId: string;
  returnUrl: string;
  completionUrl: string;
  customerId?: string;
  methods?: Array<"PIX" | "CARD">;
  metadata?: Record<string, unknown>;
}

export interface EnsureProductInput {
  externalId: string;
  name: string;
  /** Valor em reais (ex.: 99.9). Convertido para centavos na API. */
  priceReais: number;
  description?: string | null;
}

@injectable()
export class AbacatePayService {
  private readonly baseUrl = "https://api.abacatepay.com/v2";

  private get apiKey(): string {
    const key = process.env.ABACATEPAY_API_KEY;
    if (!key) {
      throw new Error(
        "ABACATEPAY_API_KEY não configurado nas variáveis de ambiente"
      );
    }
    return key;
  }

  private get hmacPublicKey(): string {
    return process.env.ABACATEPAY_HMAC_PUBLIC_KEY || DEFAULT_ABACATE_HMAC_PUBLIC_KEY;
  }

  private async request<T>(
    method: "GET" | "POST" | "DELETE",
    path: string,
    body?: unknown
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const json = (await response.json()) as {
      data?: T;
      error?: string | null;
      success?: boolean;
      message?: string;
    };

    if (!response.ok || json.success === false) {
      throw new Error(
        `AbacatePay API error ${response.status}: ${json.error || json.message || "erro desconhecido"}`
      );
    }

    return (json.data ?? json) as T;
  }

  /** Cria (ou reutiliza) produto one-time no catálogo AbacatePay. */
  async ensureProduct(input: EnsureProductInput): Promise<AbacateProduct> {
    const priceCents = Math.round(input.priceReais * 100);
    if (priceCents <= 0) {
      throw new Error("Preço do plano inválido para AbacatePay");
    }

    try {
      const created = await this.request<AbacateProduct>("POST", "/products/create", {
        externalId: input.externalId,
        name: input.name,
        description: input.description ?? undefined,
        price: priceCents,
        currency: "BRL",
      });
      return created;
    } catch (err: any) {
      // Produto com mesmo externalId pode já existir — tenta listar e achar
      const listed = await this.request<AbacateProduct[] | { data: AbacateProduct[] }>(
        "GET",
        "/products/list"
      );
      const products = Array.isArray(listed)
        ? listed
        : Array.isArray((listed as any)?.data)
          ? (listed as any).data
          : [];
      const found = products.find(
        (p: AbacateProduct) => p.externalId === input.externalId
      );
      if (found) return found;
      throw err;
    }
  }

  async createCustomer(input: {
    email: string;
    name?: string;
    taxId?: string;
    cellphone?: string;
  }): Promise<AbacateCustomer> {
    return this.request<AbacateCustomer>("POST", "/customers/create", {
      email: input.email,
      name: input.name,
      taxId: input.taxId,
      cellphone: input.cellphone,
    });
  }

  async createCheckout(input: CreateCheckoutInput): Promise<AbacateCheckout> {
    return this.request<AbacateCheckout>("POST", "/checkouts/create", {
      items: [{ id: input.productId, quantity: 1 }],
      externalId: input.externalId,
      returnUrl: input.returnUrl,
      completionUrl: input.completionUrl,
      methods: input.methods ?? ["PIX", "CARD"],
      customerId: input.customerId,
      metadata: input.metadata,
    });
  }

  /**
   * Confirma status do checkout na API (fonte de verdade pós-webhook).
   * @see https://docs.abacatepay.com/pages/checkouts/get
   */
  async getCheckout(checkoutId: string): Promise<AbacateCheckout & { paidAmount?: number; devMode?: boolean }> {
    return this.request<AbacateCheckout & { paidAmount?: number; devMode?: boolean }>(
      "GET",
      `/checkouts/get?id=${encodeURIComponent(checkoutId)}`
    );
  }

  /**
   * Cancela um checkout PENDING (ainda não pago).
   * Checkouts PAID devem usar refundCheckout.
   * @see https://docs.abacatepay.com/pages/payment/reference (status CANCELLED)
   */
  async cancelCheckout(checkoutId: string): Promise<AbacateCheckout> {
    const remote = await this.getCheckout(checkoutId);
    const status = (remote.status || "").toUpperCase();

    if (status === "CANCELLED" || status === "EXPIRED") {
      return remote;
    }
    if (status === "PAID" || status === "REFUNDED") {
      throw new AppError(
        "Checkout AbacatePay já foi pago — use reembolso em vez de cancelamento",
        422
      );
    }
    if (status !== "PENDING") {
      throw new AppError(
        `Checkout AbacatePay no status "${remote.status}" não pode ser cancelado`,
        422
      );
    }

    try {
      return await this.request<AbacateCheckout>("POST", "/checkouts/cancel", {
        id: checkoutId,
      });
    } catch (error: any) {
      const message = String(error?.message ?? "");
      if (
        message.includes("404") ||
        message.includes("NOT_FOUND") ||
        message.includes("not found") ||
        message.includes("INVALID")
      ) {
        throw new AppError(
          "Cancelamento remoto de checkout AbacatePay indisponível para este tipo/estado",
          422
        );
      }
      throw new AppError(
        `Falha temporária ao cancelar no AbacatePay: ${message || "erro de rede"}`,
        503
      );
    }
  }

  /**
   * Reembolsa integralmente um checkout pago (PIX ou Cartão).
   * @see https://docs.abacatepay.com/pages/payment/refund
   */
  async refundCheckout(
    checkoutId: string,
    reason: string
  ): Promise<{ refundId: string; status: string }> {
    try {
      const data = await this.request<{ refundPublicId: string }>(
        "POST",
        "/checkouts/refund",
        { id: checkoutId, reason }
      );
      return { refundId: data.refundPublicId, status: "REFUNDED" };
    } catch (error: any) {
      const message = error?.message ?? "";
      const knownErrors: Array<[string, string]> = [
        ["TRANSACTION_NOT_REFUNDABLE", "A transação não está em um estado reembolsável"],
        ["INSUFFICIENT_FUNDS", "Saldo insuficiente na loja para realizar o reembolso"],
        ["TRANSACTION_UNDER_DISPUTE", "Transação em disputa não pode ser reembolsada"],
        ["TRANSACTION_NOT_FOUND", "Transação não encontrada"],
        ["INVALID_METHOD", "Este método de pagamento não é reembolsável"],
      ];
      for (const [code, ptMessage] of knownErrors) {
        if (message.includes(code)) {
          throw new AppError(ptMessage, 422);
        }
      }
      throw error;
    }
  }

  /**
   * Envia um PIX de devolução proporcional para a chave do cliente.
   * Usado para "burlar" a limitação da AbacatePay (que só reembolsa o total)
   * devolvendo apenas o valor não utilizado via transferência PIX.
   * @see https://docs.abacatepay.com/pages/pix/create
   */
  async sendPix(input: {
    amountCents: number;
    externalId: string;
    description?: string;
    pixKey: string;
    pixKeyType: "CPF" | "CNPJ" | "PHONE" | "EMAIL" | "RANDOM" | "BR_CODE";
  }): Promise<{ id: string; status: string }> {
    return this.request<{ id: string; status: string }>("POST", "/pix/send", {
      amount: input.amountCents,
      externalId: input.externalId,
      description: input.description,
      pix: {
        key: input.pixKey,
        type: input.pixKeyType,
      },
    });
  }

  /**
   * Valida HMAC do header X-Webhook-Signature (chave pública AbacatePay).
   * Isso prova integridade do body vindo da Abacate — NÃO substitui o
   * ABACATEPAY_WEBHOOK_SECRET (secret do merchant na URL/header).
   * @see https://docs.abacatepay.com/pages/webhooks/security
   */
  verifyWebhookSignature(rawBody: string, signatureFromHeader: string): boolean {
    if (!rawBody || !signatureFromHeader) return false;
    const expectedSig = crypto
      .createHmac("sha256", this.hmacPublicKey)
      .update(Buffer.from(rawBody, "utf8"))
      .digest("base64");

    const a = Buffer.from(expectedSig);
    const b = Buffer.from(signatureFromHeader);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }
}
