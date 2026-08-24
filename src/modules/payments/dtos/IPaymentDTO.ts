// ──────────────────────────────────────────────────────────────────────────────
// Payment method types
// ──────────────────────────────────────────────────────────────────────────────
export type PaymentMethod = "credit_card" | "debit_card" | "pix" | "payment_link";
export type PaymentProvider = "MERCADOPAGO" | "ABACATEPAY" | "ASAAS";
export type PaymentStatus =
  | "pending"
  | "approved"
  | "authorized"
  | "in_process"
  | "in_mediation"
  | "rejected"
  | "cancelled"
  | "refunded"
  | "charged_back";

// ──────────────────────────────────────────────────────────────────────────────
// Card holder data (credit & debit)
// ──────────────────────────────────────────────────────────────────────────────
export interface ICardPayerDTO {
  email: string;
  identification: {
    type: "CPF" | "CNPJ";
    number: string;
  };
  firstName?: string;
  lastName?: string;
}

export interface IBillingAddressDTO {
  zipCode: string;
  streetName: string;
  streetNumber: string;
  neighborhood?: string;
  city?: string;
  federalUnit?: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Create credit/debit card payment
// ──────────────────────────────────────────────────────────────────────────────
export interface ICreateCardPaymentDTO {
  token: string;
  transactionAmount: number;
  description: string;
  installments: number;
  paymentMethodId: string;
  issuerId?: string;
  payer: ICardPayerDTO;
  billingAddress?: IBillingAddressDTO;
  barbershopId: string;
  serviceId?: string;
  appointmentId?: string;
  queueItemId?: string;
  externalReference?: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Create PIX payment
// ──────────────────────────────────────────────────────────────────────────────
export interface ICreatePixPaymentDTO {
  transactionAmount: number;
  description: string;
  payer: {
    email: string;
    firstName?: string;
    lastName?: string;
    identification?: {
      type: "CPF" | "CNPJ";
      number: string;
    };
  };
  barbershopId: string;
  serviceId?: string;
  appointmentId?: string;
  queueItemId?: string;
  externalReference?: string;
  expirationMinutes?: number;
}

// ──────────────────────────────────────────────────────────────────────────────
// Response
// ──────────────────────────────────────────────────────────────────────────────
export interface IPixQrCodeDTO {
  qrCode: string;
  qrCodeBase64: string;
  expirationDate: string;
}

export interface IPaymentResponseDTO {
  id: string;
  // BUG-2: string em vez de number para preservar precisão de BigInt do banco
  mpPaymentId: string | null;
  provider: PaymentProvider;
  providerPaymentId: string | null;
  checkoutUrl: string | null;
  status: PaymentStatus;
  statusDetail: string;
  paymentMethod: PaymentMethod;
  transactionAmount: number;
  currency: string;
  description: string;
  barbershopId: string;
  serviceId?: string | null;
  appointmentId?: string | null;
  queueItemId?: string | null;
  externalReference?: string | null;
  createdAt: Date;
  updatedAt: Date;
  pixQrCode?: IPixQrCodeDTO | null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Webhook
// ──────────────────────────────────────────────────────────────────────────────
export interface IMercadoPagoWebhookDTO {
  id: number;
  live_mode: boolean;
  type: string;
  date_created: string;
  application_id: number;
  user_id: number;
  version: number;
  api_version: string;
  action: string;
  data: {
    id: string;
  };
}
