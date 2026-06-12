import { Prisma } from "@prisma/client";
import { IExpenseResponseDTO, ExpenseType, ExpenseRecurrence } from "../../dtos/IExpenseDTO";

export type ExpenseWithCategory = Prisma.ExpenseGetPayload<{
  include: { category: { select: { name: true } } };
}>;

export function mapExpenseToDTO(record: ExpenseWithCategory): IExpenseResponseDTO {
  return {
    id: record.id,
    barbershopId: record.barbershopId,
    categoryId: record.categoryId ?? null,
    categoryName: record.category?.name ?? null,
    title: record.title,
    description: record.description ?? null,
    amount: record.amount,
    type: record.type as ExpenseType,
    recurrence: record.recurrence as ExpenseRecurrence,
    referenceDate: record.referenceDate,
    paidAt: record.paidAt ?? null,
    dueDate: record.dueDate ?? null,
    paymentMethod: record.paymentMethod ?? null,
    supplierName: record.supplierName ?? null,
    receiptUrl: record.receiptUrl ?? null,
    notes: record.notes ?? null,
    createdById: record.createdById,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}