import { injectable } from "tsyringe";
import {
  ICreateCardPaymentDTO,
  ICreatePixPaymentDTO
} from "../dtos/IPaymentDTO";

interface MPPaymentResponse {
  id: number;
  status: string;
  status_detail: string;
  payment_method_id: string;
  payment_type_id: string;
  transaction_amount: number;
  currency_id: string;
  description: string;
  external_reference?: string;
  date_created: string;
  date_last_updated: string;
  point_of_interaction?: {
    transaction_data?: {
      qr_code?: string;
      qr_code_base64?: string;
    };
  };
  transaction_details?: {
    external_resource_url?: string;
  };
  date_of_expiration?: string;
}

@injectable()
export class MercadoPagoService {
  private readonly baseUrl = "https://api.mercadopago.com";

  // FIX-4 + IMP-3: getter lazy — não lê a env no construtor,
  // então o servidor sobe mesmo sem o token definido
  private get accessToken(): string {
    const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!token) {
      throw new Error(
        "MERCADOPAGO_ACCESS_TOKEN não configurado nas variáveis de ambiente"
      );
    }
    return token;
  }

  private async request<T>(
    method: "GET" | "POST" | "PUT" | "PATCH",
    path: string,
    body?: unknown,
    idempotencyKey?: string
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken}`,
      "Content-Type": "application/json",
      "X-Product-Id": "agendai"
    };

    if (idempotencyKey) {
      headers["X-Idempotency-Key"] = idempotencyKey;
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });

    const json = await response.json();

    if (!response.ok) {
      const mpError = json as {
        message?: string;
        error?: string;
        cause?: Array<{ code: number; description: string }>;
      };
      const cause = mpError.cause?.map((c) => c.description).join("; ");
      throw new Error(
        `Mercado Pago API error ${response.status}: ${mpError.message || mpError.error}${cause ? " — " + cause : ""}`
      );
    }

    return json as T;
  }

  private idempotencyKey(...parts: string[]): string {
    return parts.join(":") + ":" + Date.now().toString(36);
  }

  async createCardPayment(
    data: ICreateCardPaymentDTO,
    barbershopId: string,
    serviceId?: string,
    appointmentId?: string,
    queueItemId?: string
  ): Promise<MPPaymentResponse> {
    const externalReference =
      data.externalReference || `ag-${barbershopId}-${Date.now()}`;

    const payload: Record<string, unknown> = {
      transaction_amount: data.transactionAmount,
      token: data.token,
      description: data.description,
      installments: data.installments,
      payment_method_id: data.paymentMethodId,
      issuer_id: data.issuerId,
      external_reference: externalReference,
      payer: {
        email: data.payer.email,
        first_name: data.payer.firstName,
        last_name: data.payer.lastName,
        identification: {
          type: data.payer.identification.type,
          number: data.payer.identification.number
        }
      },
      additional_info: {
        items: [
          {
            id: serviceId || "service",
            title: data.description,
            quantity: 1,
            unit_price: data.transactionAmount
          }
        ]
      },
      metadata: {
        barbershop_id: barbershopId,
        service_id: serviceId,
        appointment_id: appointmentId,
        queue_item_id: queueItemId
      }
    };

    if (data.billingAddress) {
      (payload.payer as Record<string, unknown>)["address"] = {
        zip_code: data.billingAddress.zipCode,
        street_name: data.billingAddress.streetName,
        street_number: data.billingAddress.streetNumber,
        neighborhood: data.billingAddress.neighborhood,
        city: data.billingAddress.city,
        federal_unit: data.billingAddress.federalUnit
      };
    }

    return this.request<MPPaymentResponse>(
      "POST",
      "/v1/payments",
      payload,
      this.idempotencyKey("card", barbershopId, externalReference)
    );
  }

  async createPixPayment(data: ICreatePixPaymentDTO): Promise<MPPaymentResponse> {
    const externalReference =
      data.externalReference || `ag-pix-${data.barbershopId}-${Date.now()}`;

    const expirationDate = new Date(
      Date.now() + (data.expirationMinutes ?? 30) * 60 * 1000
    ).toISOString();

    const payload: Record<string, unknown> = {
      transaction_amount: data.transactionAmount,
      description: data.description,
      payment_method_id: "pix",
      date_of_expiration: expirationDate,
      external_reference: externalReference,
      payer: {
        email: data.payer.email,
        first_name: data.payer.firstName,
        last_name: data.payer.lastName,
        ...(data.payer.identification && {
          identification: {
            type: data.payer.identification.type,
            number: data.payer.identification.number
          }
        })
      },
      additional_info: {
        items: [
          {
            id: data.serviceId || "service",
            title: data.description,
            quantity: 1,
            unit_price: data.transactionAmount
          }
        ]
      },
      metadata: {
        barbershop_id: data.barbershopId,
        service_id: data.serviceId,
        appointment_id: data.appointmentId,
        queue_item_id: data.queueItemId
      }
    };

    return this.request<MPPaymentResponse>(
      "POST",
      "/v1/payments",
      payload,
      this.idempotencyKey("pix", data.barbershopId, externalReference)
    );
  }

  // FIX-4: aceita string para manter consistência com mpPaymentId: string no DTO.
  // A API do MP usa número na URL, então convertemos internamente.
  async getPaymentById(mpPaymentId: string | number): Promise<MPPaymentResponse> {
    return this.request<MPPaymentResponse>("GET", `/v1/payments/${mpPaymentId}`);
  }

  async cancelPayment(mpPaymentId: string | number): Promise<MPPaymentResponse> {
    return this.request<MPPaymentResponse>(
      "PUT",
      `/v1/payments/${mpPaymentId}`,
      { status: "cancelled" }
    );
  }

  async refundPayment(
    mpPaymentId: string | number,
    amountReais?: number
  ): Promise<MPPaymentResponse> {
    const body = amountReais ? { amount: amountReais } : undefined;
    return this.request<MPPaymentResponse>(
      "POST",
      `/v1/payments/${mpPaymentId}/refunds`,
      body
    );
  }
}
