import { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";

type ExpenseRow = {
  amount: number;
  paidAt: Date | null;
  type: string;
  barbershopId: string;
  inventoryReceiptId?: string | null;
};

type FiadoRow = {
  originalAmount: number;
  paidAmount: number;
  creditAdjustedAmount?: number;
  dueDate: Date | null;
  barbershopId: string;
};

type FiadoSummaryRow = {
  originalAmount: number;
  paidAmount: number;
  creditAdjustedAmount?: number;
  dueDate: Date | null;
};

function remainingFiado(f: {
  originalAmount: number;
  paidAmount: number;
  creditAdjustedAmount?: number;
}): number {
  return Math.max(0, f.originalAmount - f.paidAmount - (f.creditAdjustedAmount ?? 0));
}

type EnrichedBarbershop = {
  id: string;
  name: string;
  whatsapp: string;
  active: boolean;
  approvalStatus: string;
  createdAt: Date;
  expenses: {
    total: number;
    count: number;
  };
  fiados: {
    activeCount: number;
    totalDebt: number;
    overdueCount: number;
  };
};

export class AdminFinancialController {
  async summary(request: FastifyRequest, reply: FastifyReply) {
    const { barbershopId, from, to } = request.query as {
      barbershopId?: string;
      from?: string;
      to?: string;
    };

    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;

    const dateFilter = fromDate || toDate
      ? {
        ...(fromDate && { gte: fromDate }),
        ...(toDate && { lte: toDate }),
      }
      : undefined;

    const shopFilter = barbershopId ? { barbershopId } : {};

    const expenseWhere = {
      ...shopFilter,
      ...(dateFilter && { referenceDate: dateFilter }),
    };

    const [expenses, fiadosRaw, overdueCount] = await Promise.all([
      prisma.expense.findMany({
        where: expenseWhere,
        select: {
          amount: true,
          paidAt: true,
          type: true,
          barbershopId: true,
          inventoryReceiptId: true,
        },
      }),
      prisma.fiado.findMany({
        where: {
          ...shopFilter,
          status: { in: ["PENDING", "PARTIAL"] },
        },
        select: {
          originalAmount: true,
          paidAmount: true,
          creditAdjustedAmount: true,
          dueDate: true,
          barbershopId: true,
        },
      }),
      prisma.fiado.count({
        where: {
          ...shopFilter,
          status: { in: ["PENDING", "PARTIAL"] },
          dueDate: { lt: new Date() },
        },
      }),
    ]);

    const operationalExpenses = expenses.filter((e: ExpenseRow) => !e.inventoryReceiptId);
    const stockPurchases = expenses.filter((e: ExpenseRow) => e.inventoryReceiptId);
    const totalExpenses = operationalExpenses.reduce((s: number, e: ExpenseRow) => s + e.amount, 0);
    const totalPaidExp = operationalExpenses
      .filter((e: ExpenseRow) => e.paidAt)
      .reduce((s: number, e: ExpenseRow) => s + e.amount, 0);
    const totalPendingExp = totalExpenses - totalPaidExp;
    const stockPurchaseTotal = stockPurchases.reduce((s: number, e: ExpenseRow) => s + e.amount, 0);

    const expenseByType: Record<string, { total: number; count: number }> = {};
    for (const e of operationalExpenses) {
      const cur = expenseByType[e.type] ?? { total: 0, count: 0 };
      expenseByType[e.type] = { total: cur.total + e.amount, count: cur.count + 1 };
    }

    const now = new Date();
    const totalFiadoDebt = fiadosRaw.reduce((s: number, f: FiadoRow) => s + remainingFiado(f), 0);
    const totalFiadoPaid = fiadosRaw.reduce((s: number, f: FiadoRow) => s + f.paidAmount, 0);
    const totalFiadoOrig = fiadosRaw.reduce((s: number, f: FiadoRow) => s + f.originalAmount, 0);
    const overdueAmount = fiadosRaw
      .filter((f: FiadoRow) => f.dueDate && f.dueDate < now)
      .reduce((s: number, f: FiadoRow) => s + remainingFiado(f), 0);

    return reply.send({
      success: true,
      data: {
        expenses: {
          total: totalExpenses,
          totalPaid: totalPaidExp,
          totalPending: totalPendingExp,
          count: operationalExpenses.length,
          stockPurchases: stockPurchaseTotal,
          byType: Object.entries(expenseByType).map(([type, v]) => ({ type, ...v })),
        },
        fiados: {
          activeDebtors: fiadosRaw.length,
          totalOriginal: totalFiadoOrig,
          totalPaid: totalFiadoPaid,
          totalPending: totalFiadoDebt,
          overdueCount,
          overdueAmount,
        },
      },
    });
  }

  async byBarbershop(request: FastifyRequest, reply: FastifyReply) {
    const {
      page = "1",
      limit = "20",
      sort = "debt",
    } = request.query as {
      page?: string;
      limit?: string;
      sort?: string;
    };

    const skip = (Number(page) - 1) * Number(limit);
    const take = Math.min(Number(limit), 100);

    const barbershops = await prisma.barbershop.findMany({
      where: { active: true },
      skip,
      take,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        whatsapp: true,
        active: true,
        approvalStatus: true,
        createdAt: true,
        _count: {
          select: {
            expenses: true,
            fiados: true,
          },
        },
      },
    });

    const total = await prisma.barbershop.count({ where: { active: true } });

    type BarbershopRow = typeof barbershops[number];

    const enriched: EnrichedBarbershop[] = await Promise.all(
      barbershops.map(async (shop: BarbershopRow): Promise<EnrichedBarbershop> => {
        const [expenseAgg, fiadoAgg, overdueCount] = await Promise.all([
          prisma.expense.aggregate({
            where: { barbershopId: shop.id, inventoryReceiptId: null },
            _sum: { amount: true },
            _count: { id: true },
          }),
          prisma.fiado.findMany({
            where: {
              barbershopId: shop.id,
              status: { in: ["PENDING", "PARTIAL"] },
            },
            select: { originalAmount: true, paidAmount: true, creditAdjustedAmount: true, dueDate: true },
          }),
          prisma.fiado.count({
            where: {
              barbershopId: shop.id,
              status: { in: ["PENDING", "PARTIAL"] },
              dueDate: { lt: new Date() },
            },
          }),
        ]);

        const totalDebt = fiadoAgg.reduce(
          (s: number, f: FiadoSummaryRow) => s + remainingFiado(f),
          0
        );

        return {
          id: shop.id,
          name: shop.name,
          whatsapp: shop.whatsapp,
          active: shop.active,
          approvalStatus: shop.approvalStatus,
          createdAt: shop.createdAt,
          expenses: {
            total: expenseAgg._sum.amount ?? 0,
            count: expenseAgg._count.id ?? 0,
          },
          fiados: {
            activeCount: fiadoAgg.length,
            totalDebt,
            overdueCount,
          },
        };
      })
    );

      if (sort === "debt") {
        enriched.sort((a, b) => b.fiados.totalDebt - a.fiados.totalDebt);
      } else if (sort === "expenses") {
        enriched.sort((a, b) => b.expenses.total - a.expenses.total);
      }

    return reply.send({
      success: true,
      data: enriched,
      meta: {
        total,
        page: Number(page),
        limit: take,
        totalPages: Math.ceil(total / take),
      },
    });
  }

  async barbershopDetail(request: FastifyRequest, reply: FastifyReply) {
    const { barbershopId } = request.params as { barbershopId: string };
    const { from, to } = request.query as { from?: string; to?: string };

    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;

    const barbershop = await prisma.barbershop.findUnique({
      where: { id: barbershopId },
      select: {
        id: true,
        name: true,
        whatsapp: true,
        active: true,
        approvalStatus: true,
        createdAt: true,
        subscriptions: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            status: true,
            endDate: true,
            plan: { select: { name: true, price: true } },
          },
        },
      },
    });

    if (!barbershop) {
      throw new AppError("Salão não encontrado", 404);
    }

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
          inventoryReceiptId: null,
          ...(dateFilter && { referenceDate: dateFilter }),
        },
        include: { category: { select: { name: true } } },
        orderBy: { referenceDate: "desc" },
        take: 50,
      }),
      prisma.fiado.findMany({
        where: {
          barbershopId,
          status: { in: ["PENDING", "PARTIAL"] },
        },
        include: {
          payments: { orderBy: { createdAt: "asc" } },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.fiado.count({
        where: {
          barbershopId,
          status: { in: ["PENDING", "PARTIAL"] },
          dueDate: { lt: new Date() },
        },
      }),
    ]);

    type ExpenseDetail = typeof expenses[number];
    type FiadoDetail = typeof fiados[number];

    const totalExpenses = expenses.reduce((s: number, e: ExpenseDetail) => s + e.amount, 0);
    const totalExpPaid = expenses
      .filter((e: ExpenseDetail) => e.paidAt)
      .reduce((s: number, e: ExpenseDetail) => s + e.amount, 0);

    const now = new Date();
    const totalFiadoDebt = fiados.reduce((s: number, f: FiadoDetail) => s + remainingFiado(f), 0);
    const overdueAmount = fiados
      .filter((f: FiadoDetail) => f.dueDate && f.dueDate < now)
      .reduce((s: number, f: FiadoDetail) => s + remainingFiado(f), 0);

    return reply.send({
      success: true,
      data: {
        barbershop: {
          id: barbershop.id,
          name: barbershop.name,
          whatsapp: barbershop.whatsapp,
          active: barbershop.active,
          approvalStatus: barbershop.approvalStatus,
          createdAt: barbershop.createdAt,
          subscription: barbershop.subscriptions[0] ?? null,
        },
        expenses: {
          summary: {
            total: totalExpenses,
            totalPaid: totalExpPaid,
            totalPending: totalExpenses - totalExpPaid,
            count: expenses.length,
          },
          records: expenses.map((e: ExpenseDetail) => ({
            id: e.id,
            title: e.title,
            amount: e.amount,
            type: e.type,
            recurrence: e.recurrence,
            referenceDate: e.referenceDate,
            paidAt: e.paidAt,
            categoryName: e.category?.name ?? null,
          })),
        },
        fiados: {
          summary: {
            activeDebtors: fiados.length,
            totalDebt: totalFiadoDebt,
            overdueCount,
            overdueAmount,
          },
          records: fiados.map((f: FiadoDetail) => ({
            id: f.id,
            customerName: f.customerName,
            whatsapp: f.whatsapp,
            description: f.description,
            originalAmount: f.originalAmount,
            paidAmount: f.paidAmount,
            remainingAmount: remainingFiado(f),
            status: f.status,
            dueDate: f.dueDate,
            isOverdue:
              f.dueDate != null &&
              f.dueDate < now &&
              (f.status === "PENDING" || f.status === "PARTIAL"),
            paymentsCount: f.payments.length,
          })),
        },
      },
    });
  }

  async overview(request: FastifyRequest, reply: FastifyReply) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalExpensesMonth,
      totalExpensesAll,
      fiadosActiveRows,
      totalFiadosOverdue,
      barbershopsWithDebt,
    ] = await Promise.all([
      prisma.expense.aggregate({
        where: {
          referenceDate: { gte: startOfMonth },
          inventoryReceiptId: null,
        },
        _sum: { amount: true },
      }),
      prisma.expense.aggregate({
        where: { inventoryReceiptId: null },
        _sum: { amount: true },
        _count: { id: true },
      }),
      prisma.fiado.findMany({
        where: { status: { in: ["PENDING", "PARTIAL"] } },
        select: { originalAmount: true, paidAmount: true, creditAdjustedAmount: true },
      }),
      prisma.fiado.count({
        where: {
          status: { in: ["PENDING", "PARTIAL"] },
          dueDate: { lt: now },
        },
      }),
      prisma.fiado.groupBy({
        by: ["barbershopId"],
        where: { status: { in: ["PENDING", "PARTIAL"] } },
        _count: { id: true },
      }),
    ]);

    const totalDebtActive = fiadosActiveRows.reduce(
      (s: number, f: { originalAmount: number; paidAmount: number; creditAdjustedAmount?: number }) =>
        s + remainingFiado(f),
      0
    );
    const activeDebtors = fiadosActiveRows.length;

    return reply.send({
      success: true,
      data: {
        expenses: {
          thisMonth: totalExpensesMonth._sum.amount ?? 0,
          allTime: totalExpensesAll._sum.amount ?? 0,
          count: totalExpensesAll._count.id ?? 0,
        },
        fiados: {
          activeDebtors,
          totalDebtPending: totalDebtActive,
          overdueCount: totalFiadosOverdue,
          barbershopsWithDebt: barbershopsWithDebt.length,
        },
      },
    });
  }
}