import {
  ICreateCardPaymentDTO,
  ICreatePixPaymentDTO,
  PaymentMethod,
  PaymentStatus
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

export class MercadoPagoService {
  private readonly accessToken: string;
  private readonly baseUrl = "https://api.mercadopago.com";

  constructor() {
    const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!token) {
      throw new Error(
        "MERCADOPAGO_ACCESS_TOKEN não configurado nas variáveis de ambiente"
      );
    }
    this.accessToken = token;
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
      "X-Product-Id": "barberqueue"
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

  private resolvePaymentMethod(
    paymentMethodId: string,
    paymentTypeId: string
  ): PaymentMethod {
    if (paymentTypeId === "account_money") return "credit_card";
    if (paymentTypeId === "bank_transfer") return "pix";
    if (paymentTypeId === "debit_card") return "debit_card";
    return "credit_card";
  }

  private buildExpirationDate(minutes: number): string {
    const d = new Date(Date.now() + minutes * 60 * 1000);
    return d.toISOString();
  }

  async createCardPayment(
    data: ICreateCardPaymentDTO,
    barbershopId: string,
    serviceId?: string,
    appointmentId?: string,
    queueItemId?: string
  ): Promise<MPPaymentResponse> {
    const externalReference =
      data.externalReference || `bq-${barbershopId}-${Date.now()}`;

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
      (payload.payer as Record<string, unknown>).address = {
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

  async createPixPayment(
    data: ICreatePixPaymentDTO
  ): Promise<MPPaymentResponse> {
    const externalReference =
      data.externalReference ||
      `bq-pix-${data.barbershopId}-${Date.now()}`;

    const expirationDate = this.buildExpirationDate(
      data.expirationMinutes ?? 30
    );

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

  async getPaymentById(mpPaymentId: number): Promise<MPPaymentResponse> {
    return this.request<MPPaymentResponse>(
      "GET",
      `/v1/payments/${mpPaymentId}`
    );
  }

  async cancelPayment(mpPaymentId: number): Promise<MPPaymentResponse> {
    return this.request<MPPaymentResponse>(
      "PUT",
      `/v1/payments/${mpPaymentId}`,
      { status: "cancelled" }
    );
  }
}