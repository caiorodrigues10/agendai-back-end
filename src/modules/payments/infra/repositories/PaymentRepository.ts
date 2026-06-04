import { prisma } from "@/libs/prismaClient";
import {
  IPaymentRepository,
  ICreatePaymentRecordDTO,
  IUpdatePaymentStatusDTO
} from "./IPaymentRepository"
import { IPaymentResponseDTO, PaymentStatus } from "../../../payments/dtos/IPaymentDTO"

function mapToDTO(record: any): IPaymentResponseDTO {
  return {
    id: record.id,
    mpPaymentId: record.mpPaymentId,
    status: record.status as PaymentStatus,
    statusDetail: record.statusDetail,
    paymentMethod: record.paymentMethod,
    transactionAmount: record.transactionAmount,
    currency: record.currency,
    description: record.description,
    barbershopId: record.barbershopId,
    serviceId: record.serviceId,
    appointmentId: record.appointmentId,
    queueItemId: record.queueItemId,
    externalReference: record.externalReference,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    pixQrCode: record.pixQrCode
      ? {
        qrCode: record.pixQrCode,
        qrCodeBase64: record.pixQrCodeBase64,
        expirationDate: record.pixExpirationDate?.toISOString() ?? ""
      }
      : null
  };
}

export class PaymentRepository implements IPaymentRepository {
  async create(data: ICreatePaymentRecordDTO): Promise<IPaymentResponseDTO> {
    const record = await prisma.payment.create({
      data: {
        mpPaymentId: data.mpPaymentId,
        status: data.status,
        statusDetail: data.statusDetail,
        paymentMethod: data.paymentMethod,
        transactionAmount: data.transactionAmount,
        currency: data.currency,
        description: data.description,
        barbershopId: data.barbershopId,
        serviceId: data.serviceId ?? null,
        appointmentId: data.appointmentId ?? null,
        queueItemId: data.queueItemId ?? null,
        externalReference: data.externalReference ?? null,
        pixQrCode: data.pixQrCode ?? null,
        pixQrCodeBase64: data.pixQrCodeBase64 ?? null,
        pixExpirationDate: data.pixExpirationDate ?? null,
        rawResponse: data.rawResponse ?? null
      }
    });

    return mapToDTO(record);
  }

  async findById(id: string): Promise<IPaymentResponseDTO | null> {
    const record = await prisma.payment.findUnique({ where: { id } });
    return record ? mapToDTO(record) : null;
  }

  async findByMpPaymentId(
    mpPaymentId: number
  ): Promise<IPaymentResponseDTO | null> {
    const record = await prisma.payment.findFirst({
      where: { mpPaymentId }
    });
    return record ? mapToDTO(record) : null;
  }

  async findByBarbershopId(
    barbershopId: string,
    page = 1,
    limit = 20
  ): Promise<{ data: IPaymentResponseDTO[]; total: number }> {
    const skip = (page - 1) * limit;

    const [records, total] = await Promise.all([
      prisma.payment.findMany({
        where: { barbershopId },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit
      }),
      prisma.payment.count({ where: { barbershopId } })
    ]);

    return { data: records.map(mapToDTO), total };  
  }

  async updateStatus(
    id: string,
    data: IUpdatePaymentStatusDTO
  ): Promise<IPaymentResponseDTO> {
    const record = await prisma.payment.update({
      where: { id },
      data: {
        status: data.status,
        statusDetail: data.statusDetail,
        ...(data.rawResponse !== undefined && { rawResponse: data.rawResponse })
      }
    });

    return mapToDTO(record);
  }
}