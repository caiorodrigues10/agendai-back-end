import { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "@/libs/prismaClient";
import {
  DAY_MS,
  spMonthStart,
  spMonthStartOffset,
  spYearStart,
  round2,
  monthlyValue,
  sumMonthly,
  SubscriptionWithPlan,
} from "../utils/billingPeriod";

type PlanRow = {
  id: string;
  name: string;
  price: number;
  billingCycle: string;
  active: boolean;
};


export class AdminBillingController {
  async summary(_request: FastifyRequest, reply: FastifyReply) {
    const now = new Date();
    const monthStart = spMonthStart(now);
    const prevMonthStart = spMonthStartOffset(now, -1);
    const yearStart = spYearStart(now);
    const in7d = new Date(now.getTime() + 7 * DAY_MS);
    const since30d = new Date(now.getTime() - 30 * DAY_MS);
    const since90d = new Date(now.getTime() - 90 * DAY_MS);

    const [
      paidMonth,
      paidPrevMonth,
      paidYear,
      pending,
      overdue,
      dueNext7d,
      subsByPlan,
      plans,
      endingSubs,
      canceled30d,
      pastDueSubs,
      issued90d,
    ] = await Promise.all([
      prisma.invoice.aggregate({
        where: { status: "PAID", paidAt: { gte: monthStart, lte: now } },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      prisma.invoice.aggregate({
        where: { status: "PAID", paidAt: { gte: prevMonthStart, lt: monthStart } },
        _sum: { amount: true },
      }),
      prisma.invoice.aggregate({
        where: { status: "PAID", paidAt: { gte: yearStart, lte: now } },
        _sum: { amount: true },
      }),
      prisma.invoice.aggregate({
        where: { status: "PENDING" },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      prisma.invoice.aggregate({
        where: { status: "OVERDUE" },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      prisma.invoice.aggregate({
        where: { status: "PENDING", dueDate: { gte: now, lte: in7d } },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      prisma.subscription.groupBy({
        by: ["planId"],
        where: { status: { in: ["ACTIVE", "PAST_DUE"] } },
        _count: { _all: true },
      }),
      prisma.plan.findMany({
        select: { id: true, name: true, price: true, billingCycle: true, active: true },
      }),
      prisma.subscription.findMany({
        where: {
          status: { in: ["ACTIVE", "TRIALING"] },
          endDate: { gte: now, lte: in7d },
        },
        select: { status: true, plan: { select: { price: true, billingCycle: true } } },
      }),
      prisma.subscription.findMany({
        where: { status: "CANCELED", cancelDate: { gte: since30d } },
        select: { plan: { select: { price: true, billingCycle: true } } },
      }),
      prisma.subscription.findMany({
        where: { status: "PAST_DUE" },
        select: { status: true, plan: { select: { price: true, billingCycle: true } } },
      }),
      prisma.invoice.groupBy({
        by: ["status"],
        where: { createdAt: { gte: since90d } },
        _count: { _all: true },
      }),
    ]);

    const planMap = new Map<string, PlanRow>();
    plans.forEach((plan: PlanRow) => planMap.set(plan.id, plan));

    const byPlan = subsByPlan
      .map((row: { planId: string; _count: { _all: number } }) => {
        const plan = planMap.get(row.planId);
        return {
          planId: row.planId,
          name: plan?.name ?? "Plano removido",
          price: plan?.price ?? 0,
          billingCycle: plan?.billingCycle ?? "MONTHLY",
          active: plan?.active ?? false,
          subscriptions: row._count._all,
          monthlyValue: round2(
            monthlyValue(plan?.price ?? 0, plan?.billingCycle ?? "MONTHLY") * row._count._all,
          ),
        };
      })
      .sort((a: { monthlyValue: number }, b: { monthlyValue: number }) => b.monthlyValue - a.monthlyValue);

    const mrrTotal = round2(
      byPlan.reduce(
        (total: number, row: { monthlyValue: number }) => total + row.monthlyValue,
        0,
      ),
    );

    const month = paidMonth._sum.amount ?? 0;
    const prevMonth = paidPrevMonth._sum.amount ?? 0;
    const deltaPct = prevMonth > 0 ? Math.round(((month - prevMonth) / prevMonth) * 1000) / 10 : null;

    const issued = issued90d.reduce(
      (total: number, row: { status: string; _count: { _all: number } }) =>
        row.status === "CANCELLED" ? total : total + row._count._all,
      0,
    );
    const paid = issued90d.find(
      (row: { status: string }) => row.status === "PAID",
    );
    const collectionRatePct =
      issued > 0 && paid ? Math.round((paid._count._all / issued) * 1000) / 10 : null;

    const ending = endingSubs.filter(
      (sub: SubscriptionWithPlan) => sub.status === "ACTIVE",
    );
    const trialingEnding = endingSubs.filter(
      (sub: SubscriptionWithPlan) => sub.status === "TRIALING",
    );

    return reply.status(200).send({
      success: true,
      data: {
        generatedAt: now.toISOString(),
        period: { from: monthStart.toISOString(), to: now.toISOString() },
        collected: {
          month,
          prevMonth,
          deltaPct,
          year: paidYear._sum.amount ?? 0,
          invoicesMonth: paidMonth._count._all,
        },
        receivables: {
          pending: pending._sum.amount ?? 0,
          pendingCount: pending._count._all,
          overdue: overdue._sum.amount ?? 0,
          overdueCount: overdue._count._all,
          dueNext7d: dueNext7d._sum.amount ?? 0,
          dueNext7dCount: dueNext7d._count._all,
        },
        mrr: { total: mrrTotal, byPlan },
        renewals: {
          endingIn7d: sumMonthly(ending),
          endingIn7dCount: ending.length,
          trialingEndingIn7d: sumMonthly(trialingEnding),
          trialingEndingIn7dCount: trialingEnding.length,
        },
        churn: {
          canceledIn30d: canceled30d.length,
          canceledRevenueIn30d: sumMonthly(canceled30d),
          pastDue: sumMonthly(pastDueSubs),
          pastDueCount: pastDueSubs.length,
        },
        collectionRatePct,
      },
    });
  }
}
