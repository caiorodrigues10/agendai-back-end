import { FastifyRequest, FastifyReply } from "fastify";
import { Readable } from "node:stream";
import type { Prisma, SubscriptionStatus } from "@prisma/client";
import { prisma } from "@/libs/prismaClient";
import {
  BillingStatementQuery,
} from "@/modules/admin/schemas/adminBillingSchemas";
import {
  DAY_MS,
  spMonthStartOffset,
  round2,
  monthlyValue,
} from "@/modules/admin/utils/billingPeriod";

type AgingAggregateRow = { _sum: { amount: number | null }; _count: { _all: number } };

type AgingRange = {
  key: string;
  label: string;
  /** Janela em dias: (now - toDays, now - fromDays] sobre o vencimento. */
  fromDays: number;
  toDays: number;
};

const AGING_RANGES: AgingRange[] = [
  { key: "1-7", label: "1 a 7 dias", fromDays: 1, toDays: 7 },
  { key: "8-15", label: "8 a 15 dias", fromDays: 8, toDays: 15 },
  { key: "16-30", label: "16 a 30 dias", fromDays: 16, toDays: 30 },
  { key: "31-60", label: "31 a 60 dias", fromDays: 31, toDays: 60 },
  { key: "61+", label: "mais de 60 dias", fromDays: 61, toDays: 3650 },
];

type CohortRow = { createdAt: Date; status: string };

type SubEconomicsRow = {
  plan: { price: number; billingCycle: string };
};

type StatementRow = {
  id: string;
  createdAt: Date;
  dueDate: Date;
  paidAt: Date | null;
  status: string;
  amount: number;
  planName: string | null;
  barbershopName: string | null;
};

const RETAINED_STATUSES: SubscriptionStatus[] = ["ACTIVE", "PAST_DUE"];

const csvCell = (value: unknown): string => {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const csvDate = (value: Date | null): string => (value ? value.toISOString() : "");

const statementLine = (row: StatementRow): string =>
  [
    row.id,
    row.createdAt.toISOString(),
    row.dueDate.toISOString(),
    csvDate(row.paidAt),
    row.status,
    row.amount,
    row.planName ?? "",
    row.barbershopName ?? "",
  ]
    .map(csvCell)
    .join(",");

const STATEMENT_HEADER = [
  "id",
  "createdAt",
  "dueDate",
  "paidAt",
  "status",
  "amount",
  "plan",
  "barbershop",
].join(",");

const STATEMENT_BATCH = 500;

async function* statementRows(
  where: Record<string, unknown>,
): AsyncGenerator<string, void, undefined> {
  yield `${STATEMENT_HEADER}\r\n`;
  let cursor: string | undefined;
  for (;;) {
    const rows: StatementRow[] = await prisma.invoice.findMany({
      where,
      orderBy: { id: "asc" },
      take: STATEMENT_BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        createdAt: true,
        dueDate: true,
        paidAt: true,
        status: true,
        amount: true,
        plan: { select: { name: true } },
        subscription: { select: { barbershop: { select: { name: true } } } },
      },
    }).then((items: unknown[]) =>
      (items as Array<StatementRow & {
        plan: { name: string | null } | null;
        subscription: { barbershop: { name: string } };
      }>).map((row) => ({
        id: row.id,
        createdAt: row.createdAt,
        dueDate: row.dueDate,
        paidAt: row.paidAt,
        status: row.status,
        amount: row.amount,
        planName: row.plan?.name ?? null,
        barbershopName: row.subscription?.barbershop?.name ?? null,
      })),
    );
    if (rows.length === 0) return;
    for (const row of rows) yield `${statementLine(row)}\r\n`;
    cursor = rows[rows.length - 1].id;
    if (rows.length < STATEMENT_BATCH) return;
  }
}

export class AdminBillingInsightsController {
  /** Inadimplência por faixa, coortes, economia unitária (ARPA/LTV) e previsão. */
  async insights(_request: FastifyRequest, reply: FastifyReply) {
    const now = new Date();
    const overdueBase: Prisma.InvoiceWhereInput = {
      OR: [
        { status: "OVERDUE" },
        { status: "PENDING", dueDate: { lt: now } },
      ],
    };

    const cohortStart = spMonthStartOffset(now, -5);
    const canceledSince = new Date(now.getTime() - 30 * DAY_MS);
    const forecastHorizon = new Date(now.getTime() + 30 * DAY_MS);

    const [
      agingRows,
      cohortSubs,
      paidEconomics,
      paid90d,
      pendingDue30d,
      canceled30d,
    ] = await Promise.all([
      Promise.all(
        AGING_RANGES.map((range) =>
          prisma.invoice.aggregate({
            where: {
              AND: [
                overdueBase,
                {
                  dueDate: {
                    gt: new Date(now.getTime() - range.toDays * DAY_MS),
                    lte: new Date(now.getTime() - (range.fromDays - 1) * DAY_MS),
                  },
                },
              ],
            },
            _sum: { amount: true },
            _count: { _all: true },
          }),
        ),
      ),
      prisma.subscription.findMany({
        where: { createdAt: { gte: cohortStart } },
        select: { createdAt: true, status: true },
      }),
      prisma.subscription.findMany({
        where: { status: { in: RETAINED_STATUSES } },
        select: { plan: { select: { price: true, billingCycle: true } } },
      }),
      prisma.invoice.groupBy({
        by: ["status"],
        where: { createdAt: { gte: new Date(now.getTime() - 90 * DAY_MS) } },
        _count: { _all: true },
      }),
      prisma.invoice.aggregate({
        where: { status: "PENDING", dueDate: { lte: forecastHorizon } },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      prisma.subscription.count({
        where: {
          status: "CANCELED",
          OR: [
            { cancelDate: { gte: canceledSince } },
            { AND: [{ cancelDate: null }, { updatedAt: { gte: canceledSince } }] },
          ],
        },
      }),
    ]);

    const aging = AGING_RANGES.map((range, index: number) => {
      const row = agingRows[index] as unknown as AgingAggregateRow;
      return {
        key: range.key,
        label: range.label,
        amount: round2(row._sum.amount ?? 0),
        count: row._count._all,
      };
    });
    const agingTotalAmount = round2(
      aging.reduce((total: number, b: { amount: number }) => total + b.amount, 0),
    );
    const agingTotalCount = aging.reduce(
      (total: number, b: { count: number }) => total + b.count,
      0,
    );

    const cohorts = buildCohorts(cohortSubs as CohortRow[], now);

    const activeSubs = paidEconomics as unknown as SubEconomicsRow[];
    const mrr = round2(
      activeSubs.reduce(
        (total: number, sub: SubEconomicsRow) =>
          total + monthlyValue(sub.plan.price, sub.plan.billingCycle),
        0,
      ),
    );
    const activeCount = activeSubs.length;
    const arpa = activeCount > 0 ? round2(mrr / activeCount) : 0;
    const churnRate = activeCount > 0 ? canceled30d / activeCount : 0;
    const ltv = churnRate > 0 ? round2(arpa / churnRate) : null;

    const issued90d = paid90d.filter(
      (row: { status: string }) => row.status !== "CANCELLED",
    );
    const paid90dCount =
      paid90d.find((row: { status: string }) => row.status === "PAID")?._count._all ?? 0;
    const collectionRatePct =
      issued90d.length > 0
        ? Math.round(
            (paid90dCount /
              issued90d.reduce(
                (total: number, row: { _count: { _all: number } }) => total + row._count._all,
                0,
              )) *
              1000,
          ) / 10
        : null;

    const pendingAmount = pendingDue30d._sum.amount ?? 0;
    const expectedValue =
      collectionRatePct !== null ? round2(pendingAmount * (collectionRatePct / 100)) : 0;

    return reply.status(200).send({
      success: true,
      data: {
        generatedAt: now.toISOString(),
        aging: { buckets: aging, totalAmount: agingTotalAmount, totalCount: agingTotalCount },
        cohorts,
        economics: {
          mrr,
          activeSubs: activeCount,
          arpa,
          churnRatePct: Math.round(churnRate * 1000) / 10,
          canceledIn30d: canceled30d,
          ltv,
        },
        forecast: {
          pendingDue30d: round2(pendingAmount),
          pendingDue30dCount: pendingDue30d._count._all,
          expectedValue,
          confidencePct: collectionRatePct,
        },
      },
    });
  }

  /** Extrato de faturas em CSV, emitido em streaming (lotes de 500 linhas). */
  async statement(request: FastifyRequest, reply: FastifyReply) {
    const query = request.query as BillingStatementQuery;
    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;
    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from ? { gte: query.from } : {}),
        ...(query.to ? { lte: query.to } : {}),
      };
    }

    const stamp = new Date().toISOString().slice(0, 10);
    return reply
      .status(200)
      .header("Content-Type", "text/csv; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="faturamento-${stamp}.csv"`)
      .send(Readable.from(statementRows(where)));
  }
}

function buildCohorts(rows: CohortRow[], now: Date): Array<{
  month: string;
  subscriptions: number;
  retained: number;
  canceled: number;
  retainedPct: number;
}> {
  const months: Array<{ key: string; start: Date; end: Date }> = [];
  for (let delta = -5; delta <= 0; delta += 1) {
    const start = spMonthStartOffset(now, delta);
    const end = spMonthStartOffset(now, delta + 1);
    months.push({
      key: start.toISOString().slice(0, 7),
      start,
      end,
    });
  }

  return months.map((month) => {
    const inMonth = rows.filter(
      (row: CohortRow) => row.createdAt >= month.start && row.createdAt < month.end,
    );
    const retained = inMonth.filter((row: CohortRow) =>
      (RETAINED_STATUSES as readonly string[]).includes(row.status),
    ).length;
    const canceled = inMonth.filter((row: CohortRow) => row.status === "CANCELED").length;
    return {
      month: month.key,
      subscriptions: inMonth.length,
      retained,
      canceled,
      retainedPct: inMonth.length > 0 ? Math.round((retained / inMonth.length) * 1000) / 10 : 0,
    };
  });
}
