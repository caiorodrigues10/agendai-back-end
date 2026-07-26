import { injectable } from "tsyringe";
import crypto from "node:crypto";

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
    method: "GET" | "POST",
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
