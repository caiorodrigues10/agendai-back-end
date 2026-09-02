import { prisma } from "@/libs/prismaClient";
import {
  IPaymentRepository,
  ICreatePaymentRecordDTO,
  IUpdatePaymentStatusDTO
} from "../../repositories/IPaymentRepository";
import {
  IPaymentResponseDTO,
  PaymentProvider,
  PaymentStatus
} from "../../dtos/IPaymentDTO";
import { buildPaymentProviderSnapshot } from "../../services/paymentProviderSnapshot";

// mpPaymentId é BigInt no banco. Serializamos como string para evitar
// truncamento silencioso de IDs acima de Number.MAX_SAFE_INTEGER (2^53-1).
function mapToDTO(record: any): IPaymentResponseDTO {
  const terminal = ["approved", "rejected", "cancelled", "refunded", "charged_back"].includes(
    record.status,
  );
  const expired = Boolean(
    record.pixExpirationDate && new Date(record.pixExpirationDate).getTime() <= Date.now(),
  );
  const pixAvailable = Boolean(record.pixQrCode) && !terminal && !expired;
  return {
    id: record.id,
    mpPaymentId:
      record.mpPaymentId != null ? record.mpPaymentId.toString() : null,
    provider: (record.provider as PaymentProvider) ?? "MERCADOPAGO",
    providerPaymentId: record.providerPaymentId ?? null,
    checkoutUrl: record.checkoutUrl ?? null,
    status: record.status as PaymentStatus,
    statusDetail: record.statusDetail,
    paymentMethod: record.paymentMethod,
    transactionAmount: record.transactionAmount,
    currency: record.currency,
    description: record.description,
    barbershopId: record.barbershopId,
    serviceId: record.serviceId ?? null,
    appointmentId: record.appointmentId ?? null,
    queueItemId: record.queueItemId ?? null,
    externalReference: record.externalReference ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    pixQrCode: pixAvailable
      ? {
          qrCode: record.pixQrCode,
          qrCodeBase64: record.pixQrCodeBase64 ?? "",
          expirationDate: record.pixExpirationDate?.toISOString() ?? ""
      }
      : null,
    pixState: pixAvailable ? "AVAILABLE" : expired ? "EXPIRED" : "UNAVAILABLE",
  };
}

export class PaymentRepository implements IPaymentRepository {
  async create(data: ICreatePaymentRecordDTO): Promise<IPaymentResponseDTO> {
    const record = await prisma.payment.create({
      data: {
        mpPaymentId:
          data.mpPaymentId != null && data.mpPaymentId !== ""
            ? BigInt(data.mpPaymentId)
            : null,
        provider: data.provider ?? "MERCADOPAGO",
        providerPaymentId: data.providerPaymentId ?? null,
        checkoutUrl: data.checkoutUrl ?? null,
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
        rawResponse: null,
        providerSnapshot: data.providerSnapshot ?? buildPaymentProviderSnapshot(
          data.provider ?? "MERCADOPAGO",
          data.rawResponse,
        ),
      }
    });
    return mapToDTO(record);
  }

  async findById(id: string): Promise<IPaymentResponseDTO | null> {
    const record = await prisma.payment.findUnique({ where: { id } });
    return record ? mapToDTO(record) : null;
  }

  async findByMpPaymentId(mpPaymentId: string): Promise<IPaymentResponseDTO | null> {
    const record = await prisma.payment.findUnique({
      where: { mpPaymentId: BigInt(mpPaymentId) }
    });
    return record ? mapToDTO(record) : null;
  }

  async findByProviderPaymentId(
    providerPaymentId: string
  ): Promise<IPaymentResponseDTO | null> {
    const record = await prisma.payment.findUnique({
      where: { providerPaymentId }
    });
    return record ? mapToDTO(record) : null;
  }

  async findByExternalReference(
    externalReference: string
  ): Promise<IPaymentResponseDTO | null> {
    const record = await prisma.payment.findFirst({
      where: { externalReference },
      orderBy: { createdAt: "desc" }
    });
    return record ? mapToDTO(record) : null;
  }

  // FIX-3: barbershopId undefined = sem filtro (listagem global para admin)
  async findByBarbershopId(
    barbershopId: string | undefined,
    page = 1,
    limit = 20
  ): Promise<{ data: IPaymentResponseDTO[]; total: number }> {
    const skip = (page - 1) * limit;
    const where = barbershopId ? { barbershopId } : {};
    const [records, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit
      }),
      prisma.payment.count({ where })
    ]);
    return { data: records.map(mapToDTO), total };
  }

  async updateStatus(
    id: string,
    data: IUpdatePaymentStatusDTO
  ): Promise<IPaymentResponseDTO> {
    const current = await prisma.payment.findUniqueOrThrow({
      where: { id },
      select: { provider: true },
    });
    const terminal = ["approved", "rejected", "cancelled", "refunded", "charged_back"].includes(
      data.status,
    );
    const record = await prisma.payment.update({
      where: { id },
      data: {
        status: data.status,
        statusDetail: data.statusDetail,
        ...(data.rawResponse !== undefined || data.providerSnapshot !== undefined
          ? {
              rawResponse: null,
              providerSnapshot:
                data.providerSnapshot ??
                buildPaymentProviderSnapshot(current.provider as PaymentProvider, data.rawResponse),
            }
          : {}),
        ...(terminal
          ? { pixQrCode: null, pixQrCodeBase64: null, pixExpirationDate: null }
          : {}),
      }
    });
    return mapToDTO(record);
  }
}
