import {
  IPaymentResponseDTO,
  PaymentMethod,
  PaymentProvider,
  PaymentStatus
} from "../dtos/IPaymentDTO";

export interface ICreatePaymentRecordDTO {
  mpPaymentId?: number | string | null;
  provider?: PaymentProvider;
  providerPaymentId?: string | null;
  checkoutUrl?: string | null;
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
  pixQrCode?: string | null;
  pixQrCodeBase64?: string | null;
  pixExpirationDate?: Date | null;
  rawResponse?: string | null;
}

export interface IUpdatePaymentStatusDTO {
  status: PaymentStatus;
  statusDetail: string;
  rawResponse?: string | null;
}

export interface IPaymentRepository {
  create(data: ICreatePaymentRecordDTO): Promise<IPaymentResponseDTO>;
  findById(id: string): Promise<IPaymentResponseDTO | null>;
  findByMpPaymentId(mpPaymentId: string): Promise<IPaymentResponseDTO | null>;
  findByProviderPaymentId(
    providerPaymentId: string
  ): Promise<IPaymentResponseDTO | null>;
  findByExternalReference(
    externalReference: string
  ): Promise<IPaymentResponseDTO | null>;
  // FIX-3: barbershopId opcional — undefined lista todos os pagamentos (uso exclusivo do MASTER_ADMIN)
  findByBarbershopId(
    barbershopId: string | undefined,
    page?: number,
    limit?: number
  ): Promise<{ data: IPaymentResponseDTO[]; total: number }>;
  updateStatus(
    id: string,
    data: IUpdatePaymentStatusDTO
  ): Promise<IPaymentResponseDTO>;
}
