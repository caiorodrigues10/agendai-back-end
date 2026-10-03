import { FastifyRequest, FastifyReply } from "fastify";
import { AppError } from "@/shared/errors/AppError";
import { prisma, Prisma } from "@/libs/prismaClient";
import {
  GetBarbershopInsightsUseCase,
  type InsightsPeriod,
} from "../useCases/getBarbershopInsights/GetBarbershopInsightsUseCase";
import { GetWeatherInsightsUseCase } from "../useCases/getWeatherInsights/GetWeatherInsightsUseCase";
import { summarizeRetailFinancials } from "@/modules/products/utils/retailSummary";
import { resolveOrgAccessToBarbershop } from "@/shared/utils/organizationAccess";
import { withShopContext } from "@/shared/utils/withShopContext";
import { calendarDateKey, getShopTimezone, shopDayRange } from "@/modules/financial/ledger/shopTime";
import { container } from "tsyringe";

type ExpenseAmountAggregate = { _sum: { amount: number | null } };
type ExpenseCountAggregate = { _sum: { amount: number | null }; _count: { _all: number } };
type ExpenseTypeGroup = { type: string; _sum: { amount: number | null }; _count: { _all: number } };
type PackageAggregate = { _count: { id: number }; _sum: { pricePaid: number | null } };
type RetailSummaryResult = Awaited<ReturnType<typeof summarizeRetailFinancials>>;
type FiadoTotalsRow = {
  totalDebtors: number;
  totalOriginal: number;
  totalPaid: number;
  totalPending: number;
  overdueCount: number;
  overdueAmount: number;
};
type InventoryTotalsRow = { inventoryValue: number; lowStockCount: number };

type ExpenseWithCategory = Prisma.ExpenseGetPayload<{
  include: { category: { select: { name: true } } };
}>;

type FiadoWithPayments = Prisma.FiadoGetPayload<{
  include: { payments: { orderBy: { createdAt: "asc" } } };
}>;


/**
 * Limites [start, end] de um filtro `from`/`to` vindo do front, no FUSO DO SALÃO.
 * "YYYY-MM-DD" é data de calendário (00:00 → 23:59:59.999 no fuso do salão);
 * valores completos (ISO) são usados como instante.
 */
function shopDateBounds(
  from: string | undefined,
  to: string | undefined,
  timezone: string,
): { gte?: Date; lte?: Date } {
  const isDateOnly = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
  const gte = from ? (isDateOnly(from) ? shopDayRange(calendarDateKey(new Date(from)), timezone).start : new Date(from)) : undefined;
  const lte = to ? (isDateOnly(to) ? shopDayRange(calendarDateKey(new Date(to)), timezone).end : new Date(to)) : undefined;
  return { ...(gte && { gte }), ...(lte && { lte }) };
}

export class BarbershopFinancialController {
  /**
   * Resolve qual salão a request vai ler.
   * `?barbershopId=` de outro salão só é aceito com acesso FULL àquele salão
   * (dono direto, MASTER_ADMIN ou OWNER/ADMIN da organização dona).
   * MEMBER/VIEWER da org e completely outsiders recebem 403 — estes endpoints
   * são todos financeiros.
   */
  private async resolveBarbershopId(request: FastifyRequest): Promise<string> {
    const user = request.user!;
    const query = request.query as { barbershopId?: string };
    const requested = query.barbershopId;

    if (requested && requested !== user.barbershopId) {
      const access = await resolveOrgAccessToBarbershop(user.id, user.role, requested);
      if (access === "NONE") throw new AppError("Sem acesso a este salão", 403);
      if (access === "OPERATIONAL") {
        // Estes endpoints são todos financeiros — OPERATIONAL não pode ver.
        throw new AppError("Sem acesso a dados financeiros deste salão", 403);
      }
      return requested; // FULL
    }

    if (!user.barbershopId) throw new AppError("Usuário não vinculado a nenhum salão", 400);
    return user.barbershopId;
  }

  // GET /barbershop/insights?period=7d|30d|90d
  async insights(request: FastifyRequest, reply: FastifyReply) {
    const barbershopId = await this.resolveBarbershopId(request);

    const { period: raw } = request.query as { period?: string };
    const period = (["7d", "30d", "90d", "1y"].includes(raw ?? "")
      ? raw
      : "30d") as InsightsPeriod;

    // Toda a leitura do use case (queue, appointments, expenses, fiados, users, services)
    // roda dentro do contexto do salão resolvido.
    const data = await withShopContext(request.user?.barbershopId, barbershopId, () =>
      new GetBarbershopInsightsUseCase().execute(barbershopId, period)
    );
    return reply.send({ success: true, data });
  }

  // GET /barbershop/financial/summary
  async summary(request: FastifyRequest, reply: FastifyReply) {
    const barbershopId = await this.resolveBarbershopId(request);

    const { from, to } = request.query as { from?: string; to?: string; barbershopId?: string };
    const timezone = await getShopTimezone(barbershopId);
    const bounds = shopDateBounds(from, to, timezone);
    const dateFilter = bounds.gte || bounds.lte ? bounds : undefined;

    const now = new Date();
    const operationalExpenseWhere = {
      barbershopId,
      inventoryReceiptId: null,
      ...(dateFilter && { referenceDate: dateFilter }),
    };
    const stockExpenseWhere = {
      barbershopId,
      inventoryReceiptId: { not: null },
      ...(dateFilter && { referenceDate: dateFilter }),
    };

    // Bloco de leitura único (expenses, fiados, packages, retail, products) no contexto
    // do salão resolvido; somas, contagens e agrupamentos rodam no banco.
    const [expenseTotals, paidExpenseTotals, stockExpenseTotals, expenseTypeGroups, fiadoTotalsRows, packageSales, retailSummary, inventoryTotalsRows]: [
      ExpenseCountAggregate,
      ExpenseAmountAggregate,
      ExpenseAmountAggregate,
      ExpenseTypeGroup[],
      FiadoTotalsRow[],
      PackageAggregate,
      RetailSummaryResult,
      InventoryTotalsRow[],
    ] = await withShopContext(request.user?.barbershopId, barbershopId, () =>
      Promise.all([
        prisma.expense.aggregate({ where: operationalExpenseWhere, _sum: { amount: true }, _count: { _all: true } }),
        prisma.expense.aggregate({
          where: { ...operationalExpenseWhere, paidAt: { not: null } },
          _sum: { amount: true },
        }),
        prisma.expense.aggregate({ where: stockExpenseWhere, _sum: { amount: true } }),
        prisma.expense.groupBy({
          by: ["type"],
          where: operationalExpenseWhere,
          _sum: { amount: true },
          _count: { _all: true },
        }),
        prisma.$queryRaw<FiadoTotalsRow[]>`
          SELECT
            COUNT(*)::int AS "totalDebtors",
            COALESCE(SUM("originalAmount"::float8), 0) AS "totalOriginal",
            COALESCE(SUM("paidAmount"::float8), 0) AS "totalPaid",
            COALESCE(
              SUM(GREATEST(0::float8, "originalAmount"::float8 - "paidAmount"::float8 - COALESCE("creditAdjustedAmount"::float8, 0))),
              0
            ) AS "totalPending",
            (COUNT(*) FILTER (WHERE "dueDate" < ${now}))::int AS "overdueCount",
            COALESCE(
              SUM(
                CASE WHEN "dueDate" < ${now} THEN
                  GREATEST(0::float8, "originalAmount"::float8 - "paidAmount"::float8 - COALESCE("creditAdjustedAmount"::float8, 0))
                END
              ),
              0
            ) AS "overdueAmount"
          FROM fiados
          WHERE "barbershopId" = ${barbershopId}::uuid
            AND status IN ('PENDING', 'PARTIAL')
        `,
        prisma.clientPackage.aggregate({
          where: {
            barbershopId,
            status: { in: ["ACTIVE", "DEPLETED"] },
            ...(dateFilter && { purchasedAt: dateFilter }),
          },
          _count: { id: true },
          _sum: { pricePaid: true },
        }),
        summarizeRetailFinancials(barbershopId, dateFilter),
        prisma.$queryRaw<InventoryTotalsRow[]>`
          SELECT
            COALESCE(SUM("stockQty"::float8 * "averageCost"::float8), 0) AS "inventoryValue",
            (COUNT(*) FILTER (WHERE "minStock" > 0 AND "stockQty" <= "minStock"))::int AS "lowStockCount"
          FROM products
          WHERE "barbershopId" = ${barbershopId}::uuid
            AND "trackStock" = true
            AND "active" = true
        `,
      ])
    );

    const fiadoTotals = fiadoTotalsRows[0] ?? { totalDebtors: 0, totalOriginal: 0, totalPaid: 0, totalPending: 0, overdueCount: 0, overdueAmount: 0 };
    const inventoryTotals = inventoryTotalsRows[0] ?? { inventoryValue: 0, lowStockCount: 0 };

    const totalExpenses = expenseTotals._sum.amount ?? 0;
    const totalPaidExp = paidExpenseTotals._sum.amount ?? 0;
    const totalPendingExp = totalExpenses - totalPaidExp;
    const stockPurchaseTotal = stockExpenseTotals._sum.amount ?? 0;

    const expenseByType = expenseTypeGroups.map((group: ExpenseTypeGroup) => ({
      type: group.type,
      total: group._sum.amount ?? 0,
      count: group._count._all,
    }));

    const productRevenue = retailSummary.revenue;
    const productRefunded = retailSummary.refunded;
    const productNetRevenue = retailSummary.netRevenue;
    const productCogs = retailSummary.cogs;
    const productMargin = retailSummary.margin;
    const productSaleCount = retailSummary.saleCount;
    const inventoryValue = inventoryTotals.inventoryValue;
    const lowStockCount = inventoryTotals.lowStockCount;

    return reply.send({
      success: true,
      data: {
        expenses: {
          total: totalExpenses,
          totalPaid: totalPaidExp,
          totalPending: totalPendingExp,
          count: expenseTotals._count._all,
          byType: expenseByType,
        },
        fiados: {
          activeDebtors: fiadoTotals.totalDebtors,
          totalOriginal: fiadoTotals.totalOriginal,
          totalPaid: fiadoTotals.totalPaid,
          totalPending: fiadoTotals.totalPending,
          overdueCount: fiadoTotals.overdueCount,
          overdueAmount: fiadoTotals.overdueAmount,
        },
        packages: {
          count: packageSales._count.id,
          totalPaid: packageSales._sum.pricePaid ?? 0,
        },
        products: {
          revenue: productRevenue,
          netRevenue: productNetRevenue,
          refunded: productRefunded,
          cogs: productCogs,
          margin: productMargin,
          saleCount: productSaleCount,
          inventoryValue,
          lowStockCount,
          stockPurchases: stockPurchaseTotal,
        },
      },
    });
  }

  // GET /barbershop/financial/expenses
  async expenses(request: FastifyRequest, reply: FastifyReply) {
    const barbershopId = await this.resolveBarbershopId(request);

    const { from, to, page = "1", limit = "20" } = request.query as {
      from?: string; to?: string; page?: string; limit?: string; barbershopId?: string;
    };

    const skip = (Number(page) - 1) * Number(limit);
    const take = Math.min(Number(limit), 100);

    const timezone = await getShopTimezone(barbershopId);
    const bounds = shopDateBounds(from, to, timezone);

    const where = {
      barbershopId,
      ...(bounds.gte || bounds.lte
        ? { referenceDate: bounds }
        : {}),
    };

    // findMany + count (e o include de category, tabela com RLS) no contexto do salão resolvido.
    const [records, total] = await withShopContext(request.user?.barbershopId, barbershopId, () =>
      Promise.all([
        prisma.expense.findMany({
          where,
          skip,
          take,
          orderBy: { referenceDate: "desc" },
          include: { category: { select: { name: true } } },
        }),
        prisma.expense.count({ where }),
      ])
    );

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
    const barbershopId = await this.resolveBarbershopId(request);

    const { page = "1", limit = "20", status } = request.query as {
      page?: string; limit?: string; status?: string; barbershopId?: string;
    };

    const skip = (Number(page) - 1) * Number(limit);
    const take = Math.min(Number(limit), 100);

    const where: any = {
      barbershopId,
      status: status ? status : { in: ["PENDING", "PARTIAL"] },
    };

    const now = new Date();

    // 3 queries (fiado + payments include, ambos com RLS) no contexto do salão resolvido.
    const [records, total, overdueCount] = await withShopContext(request.user?.barbershopId, barbershopId, () =>
      Promise.all([
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
      ])
    );

    return reply.send({
      success: true,
      data: records.map((f: FiadoWithPayments) => ({
        id: f.id,
        customerName: f.customerName,
        whatsapp: f.whatsapp,
        description: f.description,
        originalAmount: f.originalAmount,
        paidAmount: f.paidAmount,
        remainingAmount: Math.max(0, f.originalAmount - f.paidAmount - ((f as { creditAdjustedAmount?: number }).creditAdjustedAmount ?? 0)),
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

  async weatherInsights(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const barbershopId = await this.resolveBarbershopId(request);

    const { days } = request.query as { days?: string };
    const parsedDays = days ? parseInt(days, 10) : 7;

    const useCase = container.resolve(GetWeatherInsightsUseCase);
    // Leituras do use case (barbershop, dailyWeatherLog) no contexto do salão resolvido.
    const insights = await withShopContext(request.user?.barbershopId, barbershopId, () =>
      useCase.execute(barbershopId, user, Math.min(parsedDays, 16))
    );
    reply.send({ success: true, data: insights });
  }
}