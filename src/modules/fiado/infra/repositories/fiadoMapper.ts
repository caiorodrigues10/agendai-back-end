import { Prisma } from "@/libs/prismaClient";
import { IFiadoResponseDTO, IFiadoPaymentResponseDTO, FiadoStatus } from "../../dtos/IFiadoDTO";

export type FiadoWithPayments = Prisma.FiadoGetPayload<{
  include: { payments: true };
}>;

export type FiadoPaymentRecord = Prisma.FiadoPaymentGetPayload<Record<string, never>>;

export function mapPaymentToDTO(record: FiadoPaymentRecord): IFiadoPaymentResponseDTO {
  return {
    id: record.id,
    fiadoId: record.fiadoId,
    amount: record.amount,
    notes: record.notes ?? null,
    registeredById: record.registeredById,
    createdAt: record.createdAt,
  };
}

export function mapFiadoToDTO(record: FiadoWithPayments): IFiadoResponseDTO {
  const now = new Date();
  const remaining = record.originalAmount - record.paidAmount;
  const isOverdue =
    record.dueDate != null &&
    record.dueDate < now &&
    (record.status === "PENDING" || record.status === "PARTIAL");

  return {
    id: record.id,
    barbershopId: record.barbershopId,
    customerName: record.customerName,
    whatsapp: record.whatsapp,
    description: record.description,
    originalAmount: record.originalAmount,
    paidAmount: record.paidAmount,
    remainingAmount: Math.max(0, remaining),
    status: record.status as FiadoStatus,
    dueDate: record.dueDate ?? null,
    notes: record.notes ?? null,
    createdById: record.createdById,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    payments: record.payments.map(mapPaymentToDTO),
    isOverdue,
  };
}