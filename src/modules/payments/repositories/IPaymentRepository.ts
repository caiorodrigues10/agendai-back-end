import {
  IPaymentResponseDTO,
  PaymentMethod,
  PaymentStatus
} from "../dtos/IPaymentDTO";

export interface ICreatePaymentRecordDTO {
  mpPaymentId: number;
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
  // PIX specific
  pixQrCode?: string | null;
  pixQrCodeBase64?: string | null;
  pixExpirationDate?: Date | null;
  // Raw MP response (for audit/debugging)
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
  findByMpPaymentId(mpPaymentId: number): Promise<IPaymentResponseDTO | null>;
  findByBarbershopId(
    barbershopId: string,
    page?: number,
    limit?: number
  ): Promise<{ data: IPaymentResponseDTO[]; total: number }>;
  updateStatus(
    id: string,
    data: IUpdatePaymentStatusDTO
  ): Promise<IPaymentResponseDTO>;
}