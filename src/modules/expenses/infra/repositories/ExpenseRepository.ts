import { prisma } from "@/libs/prismaClient";
import { IExpenseRepository } from "../../repositories/IExpenseRepository";
import {
  ICreateExpenseDTO,
  IUpdateExpenseDTO,
  IExpenseResponseDTO,
  IExpenseListQuery,
  IExpenseSummary,
  ExpenseType,
} from "../../dtos/IExpenseDTO";
import { mapExpenseToDTO, ExpenseWithCategory } from "./expenseMapper";

const include = {
  category: { select: { name: true } },
} as const;

export class ExpenseRepository implements IExpenseRepository {
  async create(data: ICreateExpenseDTO): Promise<IExpenseResponseDTO> {
    const record = await prisma.expense.create({
      data: {
        barbershopId: data.barbershopId,
        categoryId: data.categoryId ?? null,
        title: data.title,
        description: data.description ?? null,
        amount: data.amount,
        type: data.type ?? "VARIABLE",
        recurrence: data.recurrence ?? "ONCE",
        referenceDate: data.referenceDate,
        paidAt: data.paidAt ?? null,
        dueDate: data.dueDate ?? null,
        paymentMethod: data.paymentMethod ?? null,
        supplierName: data.supplierName ?? null,
        receiptUrl: data.receiptUrl ?? null,
        notes: data.notes ?? null,
        createdById: data.createdById,
      },
      include,
    });
    return mapExpenseToDTO(record);
  }

  async findById(id: string): Promise<IExpenseResponseDTO | null> {
    const record = await prisma.expense.findUnique({ where: { id }, include });
    return record ? mapExpenseToDTO(record) : null;
  }

  async list(
    query: IExpenseListQuery & { barbershopId: string }
  ): Promise<{ data: IExpenseResponseDTO[]; total: number }> {
    const skip = (query.page - 1) * query.limit;

    const where: Prisma.ExpenseWhereInput = { barbershopId: query.barbershopId };

    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.type) where.type = query.type;
    if (query.recurrence) where.recurrence = query.recurrence;

    if (query.from || query.to) {
      where.referenceDate = {
        ...(query.from && { gte: query.from }),
        ...(query.to && { lte: query.to }),
      };
    }

    if (query.paid === true) where.paidAt = { not: null };
    if (query.paid === false) where.paidAt = null;

    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: "insensitive" } },
        { supplierName: { contains: query.search, mode: "insensitive" } },
        { notes: { contains: query.search, mode: "insensitive" } },
      ];
    }

    const [records, total] = await Promise.all([
      prisma.expense.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { referenceDate: "desc" },
        include,
      }),
      prisma.expense.count({ where }),
    ]);

    return { data: records.map(mapExpenseToDTO), total };
  }

  async update(id: string, data: IUpdateExpenseDTO): Promise<IExpenseResponseDTO> {
    const record = await prisma.expense.update({
      where: { id },
      data: {
        ...(data.categoryId !== undefined && { categoryId: data.categoryId }),
        ...(data.title !== undefined && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.amount !== undefined && { amount: data.amount }),
        ...(data.type !== undefined && { type: data.type }),
        ...(data.recurrence !== undefined && { recurrence: data.recurrence }),
        ...(data.referenceDate !== undefined && { referenceDate: data.referenceDate }),
        ...(data.paidAt !== undefined && { paidAt: data.paidAt }),
        ...(data.dueDate !== undefined && { dueDate: data.dueDate }),
        ...(data.paymentMethod !== undefined && { paymentMethod: data.paymentMethod }),
        ...(data.supplierName !== undefined && { supplierName: data.supplierName }),
        ...(data.receiptUrl !== undefined && { receiptUrl: data.receiptUrl }),
        ...(data.notes !== undefined && { notes: data.notes }),
      },
      include,
    });
    return mapExpenseToDTO(record);
  }

  async delete(id: string): Promise<void> {
    await prisma.expense.delete({ where: { id } });
  }

  async getSummary(barbershopId: string, from?: Date, to?: Date): Promise<IExpenseSummary> {
    const where: Prisma.ExpenseWhereInput = { barbershopId };

    if (from || to) {
      where.referenceDate = {
        ...(from && { gte: from }),
        ...(to && { lte: to }),
      };
    }

    const expenses: ExpenseWithCategory[] = await prisma.expense.findMany({
      where,
      include,
    });

    const totalAmount = expenses.reduce((s: number, e: ExpenseWithCategory) => s + e.amount, 0);
    const totalPaid = expenses.filter((e: ExpenseWithCategory) => e.paidAt).reduce((s: number, e: ExpenseWithCategory) => s + e.amount, 0);
    const totalPending = totalAmount - totalPaid;

    // Por categoria
    const catMap = new Map<string, { name: string | null; total: number; count: number }>();
    for (const e of expenses) {
      const key = e.categoryId ?? "uncategorized";
      const cur = catMap.get(key) ?? { name: e.category?.name ?? null, total: 0, count: 0 };
      catMap.set(key, { ...cur, total: cur.total + e.amount, count: cur.count + 1 });
    }
    const byCategory = Array.from(catMap.entries()).map(([key, v]) => ({
      categoryId: key === "uncategorized" ? null : key,
      categoryName: v.name,
      total: v.total,
      count: v.count,
    }));

    // Por tipo
    const typeMap = new Map<ExpenseType, { total: number; count: number }>();
    for (const e of expenses) {
      const type = e.type as ExpenseType;
      const cur = typeMap.get(type) ?? { total: 0, count: 0 };
      typeMap.set(type, { total: cur.total + e.amount, count: cur.count + 1 });
    }
    const byType = Array.from(typeMap.entries()).map(([type, v]) => ({
      type,
      total: v.total,
      count: v.count,
    }));

    // Por mês
    const monthMap = new Map<string, { total: number; count: number }>();
    for (const e of expenses) {
      const d = new Date(e.referenceDate);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const cur = monthMap.get(key) ?? { total: 0, count: 0 };
      monthMap.set(key, { total: cur.total + e.amount, count: cur.count + 1 });
    }
    const byMonth = Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({ month, total: v.total, count: v.count }));

    return { totalAmount, totalPaid, totalPending, byCategory, byType, byMonth };
  }
}