import {
  IPaymentRepository,
  ICreatePaymentRecordDTO,
  IUpdatePaymentStatusDTO
} from "../../../repositories/IPaymentRepository";
import { IPaymentResponseDTO, PaymentStatus } from "../../../dtos/IPaymentDTO";

export class MockPaymentRepository implements IPaymentRepository {
  private data: IPaymentResponseDTO[] = [];
  private seq = 1;

  async create(payload: ICreatePaymentRecordDTO): Promise<IPaymentResponseDTO> {
    const now = new Date();
    const entity: IPaymentResponseDTO = {
      id: `payment-${this.seq++}`,
      mpPaymentId: payload.mpPaymentId,
      status: payload.status,
      statusDetail: payload.statusDetail,
      paymentMethod: payload.paymentMethod,
      transactionAmount: payload.transactionAmount,
      currency: payload.currency,
      description: payload.description,
      barbershopId: payload.barbershopId,
      serviceId: payload.serviceId ?? null,
      appointmentId: payload.appointmentId ?? null,
      queueItemId: payload.queueItemId ?? null,
      externalReference: payload.externalReference ?? null,
      createdAt: now,
      updatedAt: now,
      pixQrCode: payload.pixQrCode
        ? {
            qrCode: payload.pixQrCode,
            qrCodeBase64: payload.pixQrCodeBase64 ?? "",
            expirationDate: payload.pixExpirationDate?.toISOString() ?? ""
          }
        : null
    };
    this.data.push(entity);
    return entity;
  }

  async findById(id: string): Promise<IPaymentResponseDTO | null> {
    return this.data.find((p) => p.id === id) ?? null;
  }

  async findByMpPaymentId(mpPaymentId: number): Promise<IPaymentResponseDTO | null> {
    return this.data.find((p) => p.mpPaymentId === mpPaymentId) ?? null;
  }

  async findByBarbershopId(
    barbershopId: string,
    page = 1,
    limit = 20
  ): Promise<{ data: IPaymentResponseDTO[]; total: number }> {
    const filtered = this.data.filter((p) => p.barbershopId === barbershopId);
    const start = (page - 1) * limit;
    return {
      data: filtered.slice(start, start + limit),
      total: filtered.length
    };
  }

  async updateStatus(
    id: string,
    data: IUpdatePaymentStatusDTO
  ): Promise<IPaymentResponseDTO> {
    const idx = this.data.findIndex((p) => p.id === id);
    if (idx < 0) throw new Error("Payment not found");
    this.data[idx] = {
      ...this.data[idx],
      status: data.status,
      statusDetail: data.statusDetail,
      updatedAt: new Date()
    };
    return this.data[idx];
  }
}
