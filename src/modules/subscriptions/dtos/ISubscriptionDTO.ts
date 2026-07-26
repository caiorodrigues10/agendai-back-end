import { IPaymentResponseDTO } from "@/modules/payments/dtos/IPaymentDTO";

export type SubscriptionStatus =
  | "TRIALING"
  | "ACTIVE"
  | "PAST_DUE"
  | "CANCELED"
  | "UNPAID";

export interface ISubscribeDTO {
  barbershopId: string;
  planId: string;
  paymentMethod: "pix" | "credit_card" | "payment_link";
  cardToken?: string;
  cardInstallments?: number;
  cardPaymentMethodId?: string;
  payerEmail: string;
  payerFirstName?: string;
  payerLastName?: string;
  payerIdentification?: { type: "CPF" | "CNPJ"; number: string };
}

export interface ISubscriptionResponseDTO {
  id: string;
  barbershopId: string;
  planId: string;
  planName: string;
  planPrice: number;
  planBillingCycle?: "MONTHLY" | "YEARLY";
  planHasDashboard?: boolean;
  planTierKey?: string;
  status: SubscriptionStatus;
  startDate: Date;
  endDate: Date | null;
  cancelDate: Date | null;
  createdAt: Date;
  trialEndsAt: Date;
  daysRemainingInTrial: number | null;
  latestInvoice: IInvoiceResponseDTO | null;
  /**
   * Pagamento gerado no ato da assinatura (presente apenas na resposta de
   * POST /subscriptions). Para PIX carrega o QR Code e a data de expiração,
   * permitindo ao frontend exibir o QR e fazer polling em GET /payments/:id.
   */
  payment?: IPaymentResponseDTO;
}

export interface IInvoiceResponseDTO {
  id: string;
  subscriptionId: string;
  amount: number;
  dueDate: Date;
  paidAt: Date | null;
  status: "PENDING" | "PAID" | "OVERDUE" | "CANCELLED";
  paymentMethod: string | null;
  createdAt: Date;
}