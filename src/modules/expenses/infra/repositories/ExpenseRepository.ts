import { prisma, Prisma, type AppTx } from "@/libs/prismaClient"; 
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
import { deleteLedgerEntries, recordLedgerEntry } from "@/modules/financial/ledger/financialLedger";

const include = {
  category: { select: { name: true } },
} as const;

type AmountAggregate = { _sum: { amount: number | null } };
type ExpenseTypeGroup = { type: ExpenseType; _sum: { amount: number | null }; _count: { _all: number } };
type ExpenseCategoryGroup = { categoryId: string | null; _sum: { amount: number | null }; _count: { _all: number } };
type ExpenseMonthGroup = { month: string; total: number; count: number };
type ExpenseCategoryName = { id: string; name: string };

export class ExpenseRepository implements IExpenseRepository {
  async create(data: ICreateExpenseDTO): Promise<IExpenseResponseDTO> {
    // Despesa paga entra no ledger no MESMO instante do pagamento (paidAt).
    const record = await prisma.$transaction(async (tx: AppTx) => {
      const created = await tx.expense.create({
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
      if (created.paidAt) {
        await recordLedgerEntry(tx, {
          barbershopId: created.barbershopId,
          kind: "EXPENSE",
          amount: created.amount,
          paymentMethod: created.paymentMethod,
          sourceType: "EXPENSE",
          sourceId: created.id,
          occurredAt: created.paidAt,
          professionalId: null,
          createdBy: created.createdById,
          description: created.title,
        });
      }
      return created;
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
        orderBy: [{ referenceDate: "desc" }, { id: "desc" }],
        include,
      }),
      prisma.expense.count({ where }),
    ]);

    return { data: records.map(mapExpenseToDTO), total };
  }

  async update(id: string, data: IUpdateExpenseDTO): Promise<IExpenseResponseDTO> {
    // Mudança de valor/forma/pagamento regrava o lançamento de forma idempotente.
    const record = await prisma.$transaction(async (tx: AppTx) => {
      const previous = await tx.expense.findUnique({ where: { id }, select: { barbershopId: true } });
      const updated = await tx.expense.update({
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
        ...(data.updatedById !== undefined && { updatedById: data.updatedById }),
        },
        include,
      });
      if (previous) {
        await deleteLedgerEntries(tx, {
          barbershopId: previous.barbershopId,
          sourceType: "EXPENSE",
          sourceId: updated.id,
          kind: "EXPENSE",
        });
        if (updated.paidAt) {
          await recordLedgerEntry(tx, {
            barbershopId: updated.barbershopId,
            kind: "EXPENSE",
            amount: updated.amount,
            paymentMethod: updated.paymentMethod,
            sourceType: "EXPENSE",
            sourceId: updated.id,
            occurredAt: updated.paidAt,
            professionalId: null,
            createdBy: updated.createdById,
            description: updated.title,
          });
        }
      }
      return updated;
    });
    return mapExpenseToDTO(record);
  }

  async delete(id: string): Promise<void> {
    await prisma.$transaction(async (tx: AppTx) => {
      const existing = await tx.expense.findUnique({ where: { id }, select: { barbershopId: true } });
      await tx.expense.delete({ where: { id } });
      if (existing) {
        await deleteLedgerEntries(tx, { barbershopId: existing.barbershopId, sourceType: "EXPENSE", sourceId: id });
      }
    });
  }

  async getSummary(barbershopId: string, from?: Date, to?: Date): Promise<IExpenseSummary> {
    const where: Prisma.ExpenseWhereInput = { barbershopId };

    if (from || to) {
      where.referenceDate = {
        ...(from && { gte: from }),
        ...(to && { lte: to }),
      };
    }

    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const monthConditions: Prisma.Sql[] = [Prisma.sql`"barbershopId" = ${barbershopId}::uuid`];
    if (from) monthConditions.push(Prisma.sql`"referenceDate" >= ${from}`);
    if (to) monthConditions.push(Prisma.sql`"referenceDate" <= ${to}`);

    const [totalAggregate, paidAggregate, typeGroups, categoryGroups, monthGroups]: [
      AmountAggregate,
      AmountAggregate,
      ExpenseTypeGroup[],
      ExpenseCategoryGroup[],
      ExpenseMonthGroup[],
    ] = await Promise.all([
      prisma.expense.aggregate({ where, _sum: { amount: true } }),
      prisma.expense.aggregate({ where: { ...where, paidAt: { not: null } }, _sum: { amount: true } }),
      prisma.expense.groupBy({ by: ["type"], where, _sum: { amount: true }, _count: { _all: true } }),
      prisma.expense.groupBy({ by: ["categoryId"], where, _sum: { amount: true }, _count: { _all: true } }),
      prisma.$queryRaw<ExpenseMonthGroup[]>(Prisma.sql`
        SELECT
          to_char(("referenceDate" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}::text, 'YYYY-MM') AS month,
          COALESCE(SUM(amount::float8), 0) AS total,
          COUNT(*)::int AS count
        FROM expenses
        WHERE ${Prisma.join(monthConditions, " AND ")}
        GROUP BY month
        ORDER BY month ASC
      `),
    ]);

    const categoryIds = categoryGroups
      .map((group: ExpenseCategoryGroup) => group.categoryId)
      .filter((categoryId: string | null): categoryId is string => categoryId !== null);
    const categories: ExpenseCategoryName[] = categoryIds.length
      ? await prisma.expenseCategory.findMany({ where: { id: { in: categoryIds } }, select: { id: true, name: true } })
      : [];
    const categoryNames = new Map<string, string>(categories.map((category) => [category.id, category.name]));

    const totalAmount = totalAggregate._sum.amount ?? 0;
    const totalPaid = paidAggregate._sum.amount ?? 0;
    const totalPending = totalAmount - totalPaid;

    const byCategory = categoryGroups.map((group: ExpenseCategoryGroup) => ({
      categoryId: group.categoryId,
      categoryName: group.categoryId === null ? null : categoryNames.get(group.categoryId) ?? null,
      total: group._sum.amount ?? 0,
      count: group._count._all,
    }));

    const byType = typeGroups.map((group: ExpenseTypeGroup) => ({
      type: group.type,
      total: group._sum.amount ?? 0,
      count: group._count._all,
    }));

    const byMonth = monthGroups.map((group: ExpenseMonthGroup) => ({
      month: group.month,
      total: group.total,
      count: group.count,
    }));

    return { totalAmount, totalPaid, totalPending, byCategory, byType, byMonth };
  }
}
