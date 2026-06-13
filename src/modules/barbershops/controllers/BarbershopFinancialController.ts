import { FastifyRequest, FastifyReply } from "fastify";
import { AppError } from "@/shared/errors/AppError";
import { prisma, Prisma } from "@/libs/prismaClient";

type ExpenseRow = { amount: number; paidAt: Date | null; type: string };
type FiadoRow = { originalAmount: number; paidAmount: number; dueDate: Date | null };

type ExpenseWithCategory = Prisma.ExpenseGetPayload<{
  include: { category: { select: { name: true } } };
}>;

type FiadoWithPayments = Prisma.FiadoGetPayload<{
  include: { payments: { orderBy: { createdAt: "asc" } } };
}>;

export class BarbershopFinancialController {

  // GET /barbershop/financial/summary
  async summary(request: FastifyRequest, reply: FastifyReply) {
    const barbershopId = request.user?.barbershopId;
    if (!barbershopId) throw new AppError("Usuário não vinculado a nenhuma barbearia", 400);

    const { from, to } = request.query as { from?: string; to?: string };
    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;

    const dateFilter = fromDate || toDate
      ? {
        ...(fromDate && { gte: fromDate }),
        ...(toDate && { lte: toDate }),
      }
      : undefined;

    const [expenses, fiados, overdueCount] = await Promise.all([
      prisma.expense.findMany({
        where: {
          barbershopId,
          ...(dateFilter && { referenceDate: dateFilter }),
        },
        select: { amount: true, paidAt: true, type: true },
      }),
      prisma.fiado.findMany({
        where: {
          barbershopId,
          status: { in: ["PENDING", "PARTIAL"] },
        },
        select: { originalAmount: true, paidAmount: true, dueDate: true },
      }),
      prisma.fiado.count({
        where: {
          barbershopId,
          status: { in: ["PENDING", "PARTIAL"] },
          dueDate: { lt: new Date() },
        },
      }),
    ]);

    const totalExpenses = expenses.reduce((s: number, e: ExpenseRow) => s + e.amount, 0);
    const totalPaidExp = expenses.filter((e: ExpenseRow) => e.paidAt).reduce((s: number, e: ExpenseRow) => s + e.amount, 0);
    const totalPendingExp = totalExpenses - totalPaidExp;

    const expenseByType: Record<string, { total: number; count: number }> = {};
    for (const e of expenses) {
      const cur = expenseByType[e.type] ?? { total: 0, count: 0 };
      expenseByType[e.type] = { total: cur.total + e.amount, count: cur.count + 1 };
    }

    const now = new Date();
    const totalFiadoDebt = fiados.reduce((s: number, f: FiadoRow) => s + (f.originalAmount - f.paidAmount), 0);
    const totalFiadoPaid = fiados.reduce((s: number, f: FiadoRow) => s + f.paidAmount, 0);
    const totalFiadoOrig = fiados.reduce((s: number, f: FiadoRow) => s + f.originalAmount, 0);
    const overdueAmount = fiados
      .filter((f: FiadoRow) => f.dueDate && f.dueDate < now)
      .reduce((s: number, f: FiadoRow) => s + (f.originalAmount - f.paidAmount), 0);

    return reply.send({
      success: true,
      data: {
        expenses: {
          total: totalExpenses,
          totalPaid: totalPaidExp,
          totalPending: totalPendingExp,
          count: expenses.length,
          byType: Object.entries(expenseByType).map(([type, v]) => ({ type, ...v })),
        },
        fiados: {
          activeDebtors: fiados.length,
          totalOriginal: totalFiadoOrig,
          totalPaid: totalFiadoPaid,
          totalPending: totalFiadoDebt,
          overdueCount,
          overdueAmount,
        },
      },
    });
  }

  // GET /barbershop/financial/expenses
  async expenses(request: FastifyRequest, reply: FastifyReply) {
    const barbershopId = request.user?.barbershopId;
    if (!barbershopId) throw new AppError("Usuário não vinculado a nenhuma barbearia", 400);

    const { from, to, page = "1", limit = "20" } = request.query as {
      from?: string; to?: string; page?: string; limit?: string;
    };

    const skip = (Number(page) - 1) * Number(limit);
    const take = Math.min(Number(limit), 100);

    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;

    const where = {
      barbershopId,
      ...(fromDate || toDate
        ? {
          referenceDate: {
            ...(fromDate && { gte: fromDate }),
            ...(toDate && { lte: toDate }),
          },
        }
        : {}),
    };

    const [records, total] = await Promise.all([
      prisma.expense.findMany({
        where,
        skip,
        take,
        orderBy: { referenceDate: "desc" },
        include: { category: { select: { name: true } } },
      }),
      prisma.expense.count({ where }),
    ]);

    return reply.send({
      success: true,
      data: records.map((e: ExpenseWithCategory) => ({
        id: e.id,
        title: e.title,
        amount: e.amount,
        type: e.type,
        recurrence: e.recurrence,
        referenceDate: e.referenceDate,
        paidAt: e.paidAt,
        categoryName: e.category?.name ?? null,
      })),
      meta: {
        total,
        page: Number(page),
        limit: take,
        totalPages: Math.ceil(total / take),
      },
    });
  }

  // GET /barbershop/financial/fiados
  async fiados(request: FastifyRequest, reply: FastifyReply) {
    const barbershopId = request.user?.barbershopId;
    if (!barbershopId) throw new AppError("Usuário não vinculado a nenhuma barbearia", 400);

    const { page = "1", limit = "20", status } = request.query as {
      page?: string; limit?: string; status?: string;
    };

    const skip = (Number(page) - 1) * Number(limit);
    const take = Math.min(Number(limit), 100);

    const where: any = {
      barbershopId,
      status: status ? status : { in: ["PENDING", "PARTIAL"] },
    };

    const now = new Date();

    const [records, total, overdueCount] = await Promise.all([
      prisma.fiado.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
        include: { payments: { orderBy: { createdAt: "asc" } } },
      }),
      prisma.fiado.count({ where }),
      prisma.fiado.count({
        where: {
          barbershopId,
          status: { in: ["PENDING", "PARTIAL"] },
          dueDate: { lt: now },
        },
      }),
    ]);

    return reply.send({
      success: true,
      data: records.map((f: FiadoWithPayments) => ({
        id: f.id,
        customerName: f.customerName,
        whatsapp: f.whatsapp,
        description: f.description,
        originalAmount: f.originalAmount,
        paidAmount: f.paidAmount,
        remainingAmount: Math.max(0, f.originalAmount - f.paidAmount),
        status: f.status,
        dueDate: f.dueDate,
        isOverdue:
          f.dueDate != null &&
          f.dueDate < now &&
          (f.status === "PENDING" || f.status === "PARTIAL"),
        paymentsCount: f.payments.length,
      })),
      meta: {
        total,
        page: Number(page),
        limit: take,
        totalPages: Math.ceil(total / take),
        overdueCount,
      },
    });
  }
}