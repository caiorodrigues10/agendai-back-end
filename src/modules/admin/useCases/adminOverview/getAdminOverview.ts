import { prisma } from "@/libs/prismaClient";
import { rlsTransaction } from "@/libs/prismaExtensions";
import type { OverviewPeriod } from "../../schemas/adminOverviewSchemas";
import { overviewCache, readThrough } from "./overviewCache";

const SP_TIMEZONE = "America/Sao_Paulo";

const PERIOD_LABELS: Record<OverviewPeriod, string> = {
  today: "Hoje",
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
  "90d": "Últimos 90 dias",
  "12m": "Últimos 12 meses",
};

type OverviewBucket = "hour" | "day" | "month";

const PERIOD_BUCKETS: Record<OverviewPeriod, OverviewBucket> = {
  today: "hour",
  "7d": "day",
  "30d": "day",
  "90d": "day",
  "12m": "month",
};

const BUCKET_STEP: Record<OverviewBucket, string> = {
  hour: "1 hour",
  day: "1 day",
  month: "1 month",
};

export interface AttentionItem {
  id: string;
  severity: "danger" | "warning" | "info";
  title: string;
  description: string;
  count: number;
  to: string;
}

export interface OverviewPlanRow {
  planId: string;
  name: string;
  price: number;
  billingCycle: string;
  activeSubscriptions: number;
  periodRevenue: number;
  periodInvoices: number;
}

export interface AdminOverviewPayload {
  period: {
    key: OverviewPeriod;
    label: string;
    bucket: OverviewBucket;
    from: string;
    to: string;
    prevFrom: string;
    prevTo: string;
  };
  generatedAt: string;
  revenue: {
    mrr: number;
    arr: number;
    arpa: number;
    periodRevenue: number;
    periodRevenuePrev: number;
    periodRevenueDeltaPct: number | null;
    paidInvoices: number;
    byPlan: OverviewPlanRow[];
  };
  subscriptions: {
    active: number;
    trialing: number;
    pending: number;
    pastDue: number;
    unpaid: number;
    canceled: number;
    trialingExpiring3d: number;
    trialingExpiring7d: number;
    newInPeriod: number;
    newInPrevPeriod: number;
    upgrades: number;
    downgrades: number;
  };
  growth: {
    newShops: number;
    newShopsPrev: number;
    newShopsDeltaPct: number | null;
    activeShops: number;
    pendingApprovals: number;
    inactiveShops14d: number;
    churnShops: number;
    churnRevenue: number;
    trialStarted: number;
    trialPaid: number;
    trialToPaidPct: number | null;
  };
  usage: {
    appointmentsCreated: number;
    completedAppointments: number;
    gmv: number;
    newClients: number;
    whatsappSent: number;
    whatsappDelivered: number;
    emailSent: number;
    avgRating: number | null;
    reviews: number;
  };
  health: {
    errors5xx24h: number;
    errors5xxLastHour: number;
    cronFailures24h: number;
    outboxStuck: number;
    whatsappFailed24h: number;
    emailFailed24h: number;
    avgDeliveryLatencyMs: number;
  };
  attention: AttentionItem[];
  charts: {
    series: string[];
    newShops: number[];
    revenue: number[];
    appointmentsCreated: number[];
    appointmentsCompleted: number[];
    mrr: number[];
    funnel: {
      shopsCreated: number;
      onboardingCompleted: number;
      shopsWithAppointment: number;
      paidSubscriptions: number;
    };
  };
}

interface PeriodWindow {
  from: Date;
  to: Date;
  prevFrom: Date;
  prevTo: Date;
}

type PlanInfo = { id: string; name: string; price: number; billingCycle: string };
type SubPlanRow = { planId: string; status: string; _count: { _all: number } };

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function pctDelta(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return round2(((current - previous) / previous) * 100);
}

function startOfTodaySaoPaulo(): Date {
  const formatted = new Intl.DateTimeFormat("en-CA", {
    timeZone: SP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [year, month, day] = formatted.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 3, 0, 0, 0));
}

function periodWindow(period: OverviewPeriod, now: Date): PeriodWindow {
  if (period === "today") {
    const from = startOfTodaySaoPaulo();
    const dayMs = 24 * 60 * 60 * 1000;
    return { from, to: now, prevFrom: new Date(from.getTime() - dayMs), prevTo: from };
  }

  const from = new Date(now);
  const prevFrom = new Date(now);

  switch (period) {
    case "7d":
      from.setDate(now.getDate() - 7);
      prevFrom.setDate(now.getDate() - 14);
      break;
    case "30d":
      from.setDate(now.getDate() - 30);
      prevFrom.setDate(now.getDate() - 60);
      break;
    case "90d":
      from.setDate(now.getDate() - 90);
      prevFrom.setDate(now.getDate() - 180);
      break;
    case "12m":
      from.setMonth(now.getMonth() - 12);
      prevFrom.setMonth(now.getMonth() - 24);
      break;
  }

  return { from, to: now, prevFrom, prevTo: from };
}

async function buildOverview(period: OverviewPeriod): Promise<AdminOverviewPayload> {
  const now = new Date();
  const { from, to, prevFrom, prevTo } = periodWindow(period, now);
  const bucket = PERIOD_BUCKETS[period];
  const step = BUCKET_STEP[bucket];

  const dayMs = 24 * 60 * 60 * 1000;
  const in24h = new Date(now.getTime() - dayMs);
  const in1h = new Date(now.getTime() - 60 * 60 * 1000);
  const in3d = new Date(now.getTime() + 3 * dayMs);
  const in7d = new Date(now.getTime() + 7 * dayMs);
  const in14d = new Date(now.getTime() - 14 * dayMs);
  const in48h = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  const in10min = new Date(now.getTime() - 10 * 60 * 1000);
  const in15min = new Date(now.getTime() - 15 * 60 * 1000);

  const [
    plans,
    subStatus,
    subByPlan,
    trialingExpiring3d,
    trialingExpiring7d,
    periodRevenueAgg,
    prevRevenueAgg,
    revenueByPlan,
    newInPeriod,
    newInPrevPeriod,
    canceledByPlan,
    trialStarted,
    trialPaid,
    newShops,
    newShopsPrev,
    activeShops,
    pendingApprovals,
    inactiveShops14d,
    appointmentsCreated,
    completedAppointments,
    gmvAgg,
    newClients,
    whatsappSent,
    whatsappDelivered,
    emailSent,
    ratingAgg,
    errors5xx24h,
    errors5xxLastHour,
    cronFailures24h,
    outboxStuck,
    whatsappFailed24h,
    emailFailed24h,
    overdueInvoices,
    oldTickets,
    funnelOnboarding,
    funnelWithAppointment,
    funnelPaid,
    planChanges,
    latencyRow,
  ] = await Promise.all([
    prisma.plan.findMany({ select: { id: true, name: true, price: true, billingCycle: true } }),
    prisma.subscription.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.subscription.groupBy({ by: ["planId", "status"], _count: { _all: true } }),
    prisma.subscription.count({
      where: { status: "TRIALING", endDate: { gte: now, lte: in3d } },
    }),
    prisma.subscription.count({
      where: { status: "TRIALING", endDate: { gte: now, lte: in7d } },
    }),
    prisma.invoice.aggregate({
      where: { status: "PAID", paidAt: { gte: from, lt: to } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.invoice.aggregate({
      where: { status: "PAID", paidAt: { gte: prevFrom, lt: prevTo } },
      _sum: { amount: true },
    }),
    prisma.invoice.groupBy({
      by: ["planId"],
      where: { status: "PAID", paidAt: { gte: from, lt: to } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.subscription.count({ where: { createdAt: { gte: from, lt: to } } }),
    prisma.subscription.count({ where: { createdAt: { gte: prevFrom, lt: prevTo } } }),
    prisma.subscription.groupBy({
      by: ["planId"],
      where: { status: "CANCELED", cancelDate: { gte: from, lt: to } },
      _count: { _all: true },
    }),
    prisma.subscription.count({ where: { createdAt: { gte: from, lt: to } } }),
    prisma.subscription.count({
      where: {
        createdAt: { gte: from, lt: to },
        status: "ACTIVE",
        invoices: { some: { status: "PAID" } },
      },
    }),
    prisma.barbershop.count({ where: { createdAt: { gte: from, lt: to } } }),
    prisma.barbershop.count({ where: { createdAt: { gte: prevFrom, lt: prevTo } } }),
    prisma.barbershop.count({ where: { active: true } }),
    prisma.barbershop.count({ where: { approvalStatus: "PENDING" } }),
    prisma.barbershop.count({
      where: {
        active: true,
        approvalStatus: "APPROVED",
        appointments: { none: { createdAt: { gte: in14d } } },
        queue: { none: { joinedAt: { gte: in14d } } },
      },
    }),
    prisma.appointment.count({ where: { createdAt: { gte: from, lt: to } } }),
    prisma.appointment.count({
      where: { status: "COMPLETED", completedAt: { gte: from, lt: to } },
    }),
    prisma.payment.aggregate({
      where: {
        status: "approved",
        createdAt: { gte: from, lt: to },
        OR: [
          { serviceId: { not: null } },
          { appointmentId: { not: null } },
          { queueItemId: { not: null } },
        ],
      },
      _sum: { transactionAmount: true },
    }),
    prisma.salonClient.count({ where: { createdAt: { gte: from, lt: to } } }),
    prisma.notificationDelivery.count({
      where: {
        channel: "WHATSAPP",
        status: { in: ["SENT", "DELIVERED", "READ"] },
        sentAt: { gte: from, lt: to },
      },
    }),
    prisma.notificationDelivery.count({
      where: {
        channel: "WHATSAPP",
        status: { in: ["DELIVERED", "READ"] },
        sentAt: { gte: from, lt: to },
      },
    }),
    prisma.notificationDelivery.count({
      where: {
        channel: "EMAIL",
        status: { in: ["SENT", "DELIVERED", "READ"] },
        sentAt: { gte: from, lt: to },
      },
    }),
    prisma.clientReview.aggregate({
      where: { createdAt: { gte: from, lt: to } },
      _avg: { rating: true },
      _count: { _all: true },
    }),
    prisma.errorLog.count({ where: { statusCode: { gte: 500 }, createdAt: { gte: in24h } } }),
    prisma.errorLog.count({ where: { statusCode: { gte: 500 }, createdAt: { gte: in1h } } }),
    prisma.cronRun.count({ where: { status: "FAILED", startedAt: { gte: in24h } } }),
    prisma.notificationOutbox.count({
      where: {
        OR: [
          { status: "FAILED" },
          { status: "PUBLISHING", lockedAt: { lt: in10min } },
          { status: "PENDING", nextAttemptAt: { lt: in15min } },
        ],
      },
    }),
    prisma.notificationDelivery.count({
      where: {
        channel: "WHATSAPP",
        status: { in: ["FAILED", "BOUNCED"] },
        createdAt: { gte: in24h },
      },
    }),
    prisma.notificationDelivery.count({
      where: {
        channel: "EMAIL",
        status: { in: ["FAILED", "BOUNCED"] },
        createdAt: { gte: in24h },
      },
    }),
    prisma.invoice.count({ where: { status: "OVERDUE", dueDate: { lt: now } } }),
    prisma.ticket.count({
      where: {
        status: { in: ["OPEN", "IN_PROGRESS", "WAITING_SHOP"] },
        createdAt: { lt: in48h },
      },
    }),
    prisma.barbershop.count({ where: { onboardingCompletedAt: { gte: from, lt: to } } }),
    prisma.barbershop.count({
      where: { createdAt: { lt: to }, appointments: { some: { createdAt: { lt: to } } } },
    }),
    prisma.subscription.count({
      where: { createdAt: { lt: to }, invoices: { some: { status: "PAID", createdAt: { lt: to } } } },
    }),
    countPlanChanges(from, to),
    avgDeliveryLatency(from),
  ]);

  const statusCount = (status: string): number =>
    subStatus.find(
        (row: { status: string; _count: { _all: number } }) => row.status === status,
      )?._count._all ?? 0;

  const planById = new Map<string, PlanInfo>(
    plans.map((plan: PlanInfo) => [plan.id, plan]),
  );
  const monthlyPrice = (planId: string): number => {
    const plan = planById.get(planId);
    if (!plan) return 0;
    return plan.billingCycle === "YEARLY" ? plan.price / 12 : plan.price;
  };

  const mrrStatuses = ["ACTIVE", "PAST_DUE"];
  let mrr = 0;
  let payingSubscriptions = 0;
  for (const row of subByPlan) {
    if (!mrrStatuses.includes(row.status)) continue;
    mrr += monthlyPrice(row.planId) * row._count._all;
    payingSubscriptions += row._count._all;
  }
  mrr = round2(mrr);

  const periodRevenue = round2(periodRevenueAgg._sum.amount ?? 0);
  const periodRevenuePrev = round2(prevRevenueAgg._sum.amount ?? 0);

  const revenueByPlanMap = new Map<string, { amount: number; invoices: number }>(
    revenueByPlan.map(
      (row: { planId: string | null; _sum: { amount: number | null }; _count: { _all: number } }) => [
      row.planId ?? "none",
        { amount: round2(row._sum.amount ?? 0), invoices: row._count._all },
      ]),
    );

  const byPlan: OverviewPlanRow[] = plans
    .map((plan: PlanInfo) => {
      const revenueEntry = revenueByPlanMap.get(plan.id);
      const activeSubscriptions = subByPlan
        .filter(
          (row: SubPlanRow) =>
            row.planId === plan.id && ["ACTIVE", "TRIALING", "PAST_DUE"].includes(row.status),
        )
        .reduce((total: number, row: SubPlanRow) => total + row._count._all, 0);

      return {
        planId: plan.id,
        name: plan.name,
        price: plan.price,
        billingCycle: plan.billingCycle,
        activeSubscriptions,
        periodRevenue: revenueEntry?.amount ?? 0,
        periodInvoices: revenueEntry?.invoices ?? 0,
      };
    })
    .sort(
      (a: OverviewPlanRow, b: OverviewPlanRow) =>
        b.periodRevenue - a.periodRevenue || b.activeSubscriptions - a.activeSubscriptions,
    );

  const orphanRevenue = revenueByPlanMap.get("none");
  if (orphanRevenue) {
    byPlan.push({
      planId: "none",
      name: "Sem plano vinculado",
      price: 0,
      billingCycle: "MONTHLY",
      activeSubscriptions: 0,
      periodRevenue: orphanRevenue.amount,
      periodInvoices: orphanRevenue.invoices,
    });
  }

  const churnShops = canceledByPlan.reduce(
    (total: number, row: SubPlanRow) => total + row._count._all,
    0,
  );
  const churnRevenue = round2(
    canceledByPlan.reduce(
      (total: number, row: SubPlanRow) => total + monthlyPrice(row.planId) * row._count._all,
      0,
    ),
  );

  const attentionCandidates: AttentionItem[] = [
    {
      id: "overdue-invoices",
      severity: "danger",
      title: "Cobranças vencidas",
      description: "Faturas com vencimento passado e sem pagamento.",
      count: overdueInvoices,
      to: "/master/billing",
    },
    {
      id: "past-due-subscriptions",
      severity: "danger",
      title: "Assinaturas em atraso",
      description: "Assinaturas com cobrança pendente de regularização.",
      count: statusCount("PAST_DUE") + statusCount("UNPAID"),
      to: "/master/billing",
    },
    {
      id: "errors-last-hour",
      severity: "danger",
      title: "Erros 5xx na última hora",
      description: "Falhas de servidor registradas recentemente.",
      count: errors5xxLastHour,
      to: "/master/operations",
    },
    {
      id: "outbox-stuck",
      severity: "warning",
      title: "Mensagens presas na fila",
      description: "Outbox de notificações travado, com falha ou atrasado.",
      count: outboxStuck,
      to: "/master/operations",
    },
    {
      id: "cron-failures",
      severity: "warning",
      title: "Crons com falha (24h)",
      description: "Rotinas agendadas que terminaram em erro.",
      count: cronFailures24h,
      to: "/master/operations",
    },
    {
      id: "failed-deliveries",
      severity: "warning",
      title: "Entregas com falha (24h)",
      description: "E-mails e mensagens de WhatsApp que falharam.",
      count: whatsappFailed24h + emailFailed24h,
      to: "/master/operations",
    },
    {
      id: "trials-expiring",
      severity: "warning",
      title: "Trials expirando em 7 dias",
      description: "Salões em período gratuito que precisam de abordagem.",
      count: trialingExpiring7d,
      to: "/master/accounts",
    },
    {
      id: "pending-approvals",
      severity: "warning",
      title: "Salões aguardando aprovação",
      description: "Cadastros pendentes de revisão.",
      count: pendingApprovals,
      to: "/master/accounts",
    },
    {
      id: "inactive-shops",
      severity: "warning",
      title: "Salões inativos há 14 dias",
      description: "Sem atendimentos nem entradas na fila no período.",
      count: inactiveShops14d,
      to: "/master/accounts",
    },
    {
      id: "old-tickets",
      severity: "info",
      title: "Chamados abertos há mais de 48h",
      description: "Atendimentos sem resposta no prazo.",
      count: oldTickets,
      to: "/master/tickets",
    },
    {
      id: "errors-24h",
      severity: "info",
      title: "Erros 5xx nas últimas 24h",
      description: "Total de falhas de servidor no dia.",
      count: errors5xx24h,
      to: "/master/operations",
    },
  ];

  const attention = attentionCandidates.filter((item: AttentionItem) => item.count > 0);

  const series = await buildSeries(from, to, bucket, step);
  const funnel = {
    shopsCreated: newShops,
    onboardingCompleted: funnelOnboarding,
    shopsWithAppointment: funnelWithAppointment,
    paidSubscriptions: funnelPaid,
  };

  return {
    period: {
      key: period,
      label: PERIOD_LABELS[period],
      bucket,
      from: from.toISOString(),
      to: to.toISOString(),
      prevFrom: prevFrom.toISOString(),
      prevTo: prevTo.toISOString(),
    },
    generatedAt: now.toISOString(),
    revenue: {
      mrr,
      arr: round2(mrr * 12),
      arpa: payingSubscriptions > 0 ? round2(mrr / payingSubscriptions) : 0,
      periodRevenue,
      periodRevenuePrev,
      periodRevenueDeltaPct: pctDelta(periodRevenue, periodRevenuePrev),
      paidInvoices: periodRevenueAgg._count._all,
      byPlan,
    },
    subscriptions: {
      active: statusCount("ACTIVE"),
      trialing: statusCount("TRIALING"),
      pending: statusCount("PENDING"),
      pastDue: statusCount("PAST_DUE"),
      unpaid: statusCount("UNPAID"),
      canceled: statusCount("CANCELED"),
      trialingExpiring3d,
      trialingExpiring7d,
      newInPeriod,
      newInPrevPeriod,
      upgrades: planChanges.upgrades,
      downgrades: planChanges.downgrades,
    },
    growth: {
      newShops,
      newShopsPrev,
      newShopsDeltaPct: pctDelta(newShops, newShopsPrev),
      activeShops,
      pendingApprovals,
      inactiveShops14d,
      churnShops,
      churnRevenue,
      trialStarted,
      trialPaid,
      trialToPaidPct: trialStarted > 0 ? round2((trialPaid / trialStarted) * 100) : null,
    },
    usage: {
      appointmentsCreated,
      completedAppointments,
      gmv: round2(gmvAgg._sum.transactionAmount ?? 0),
      newClients,
      whatsappSent,
      whatsappDelivered,
      emailSent,
      avgRating: ratingAgg._avg.rating ? round2(ratingAgg._avg.rating) : null,
      reviews: ratingAgg._count._all,
    },
    health: {
      errors5xx24h,
      errors5xxLastHour,
      cronFailures24h,
      outboxStuck,
      whatsappFailed24h,
      emailFailed24h,
      avgDeliveryLatencyMs: round2(latencyRow?.ms ?? 0),
    },
    attention,
    charts: series ? { ...series, funnel } : { series: [], newShops: [], revenue: [], appointmentsCreated: [], appointmentsCompleted: [], mrr: [], funnel },
  };
}

async function countPlanChanges(from: Date, to: Date): Promise<{ upgrades: number; downgrades: number }> {
  const rows = await rlsTransaction(async (tx: any) =>
    tx.$queryRaw<Array<{ upgrades: number; downgrades: number }>>`
      WITH ranked AS (
        SELECT
          i.id,
          i."subscriptionId",
          i."planId",
          i."createdAt",
          LAG(i."planId") OVER (
            PARTITION BY i."subscriptionId"
            ORDER BY i."createdAt", i.id
          ) AS prev_plan_id
        FROM invoices i
        WHERE i."planId" IS NOT NULL
      )
      SELECT
        count(*) FILTER (
          WHERE np.price > pp.price
        )::int AS upgrades,
        count(*) FILTER (
          WHERE np.price < pp.price
        )::int AS downgrades
      FROM ranked r
      JOIN plans np ON np.id = r."planId"
      JOIN plans pp ON pp.id = r.prev_plan_id
      WHERE r."createdAt" >= ${from}::timestamp
        AND r."createdAt" < ${to}::timestamp
        AND r.prev_plan_id IS NOT NULL
        AND r."planId" <> r.prev_plan_id
    `,
  );

  return {
    upgrades: rows[0]?.upgrades ?? 0,
    downgrades: rows[0]?.downgrades ?? 0,
  };
}

async function avgDeliveryLatency(from: Date): Promise<{ ms: number } | null> {
  const rows = await rlsTransaction(async (tx: any) =>
    tx.$queryRaw<Array<{ ms: number | null }>>`
      SELECT COALESCE(
        avg(EXTRACT(EPOCH FROM (d."sentAt" - d."queuedAt")) * 1000),
        0
      )::float AS ms
      FROM notification_deliveries d
      WHERE d."sentAt" >= ${from}::timestamp
        AND d."sentAt" IS NOT NULL
        AND d."queuedAt" IS NOT NULL
    `,
  );

  return rows[0] ? { ms: rows[0].ms ?? 0 } : null;
}

interface SeriesCharts {
  series: string[];
  newShops: number[];
  revenue: number[];
  appointmentsCreated: number[];
  appointmentsCompleted: number[];
  mrr: number[];
}

async function buildSeries(
  from: Date,
  to: Date,
  bucket: OverviewBucket,
  step: string,
): Promise<SeriesCharts | null> {
  const bucketSql = bucket;
  const stepSql = step;
  const timezoneSql = SP_TIMEZONE;
  const formatSql = bucket === "hour" ? 'YYYY-MM-DD"T"HH24:MI' : "YYYY-MM-DD";

  const [mrrRows, shopsRows, revenueRows, createdRows, completedRows] = await rlsTransaction(
    async (tx: any) => {
      const mrr = await tx.$queryRaw<Array<{ date: string; value: number }>>`
        WITH series AS (
          SELECT generate_series(
            date_trunc(${bucketSql}::text, ${from}::timestamp),
            date_trunc(${bucketSql}::text, ${to}::timestamp - interval '1 second'),
            ${stepSql}::interval
          ) AS d
        )
        SELECT
          to_char(s.d, ${formatSql}) AS date,
          COALESCE(SUM(
            CASE WHEN p."billingCycle" = 'YEARLY' THEN p.price / 12.0 ELSE p.price END
          ), 0)::float AS value
        FROM series s
        LEFT JOIN subscriptions sub
          ON sub."startDate" < (s.d + interval '1 day')
         AND sub.status IN ('ACTIVE', 'PAST_DUE')
        LEFT JOIN plans p ON p.id = sub."planId"
        GROUP BY s.d
        ORDER BY s.d
      `;

      const shops = await tx.$queryRaw<Array<{ date: string; value: number }>>`
        SELECT
          to_char(
            date_trunc(${bucketSql}::text, (b."createdAt" AT TIME ZONE 'UTC'::text) AT TIME ZONE ${timezoneSql}::text),
            ${formatSql}
          ) AS date,
          count(*)::int AS value
        FROM barbershops b
        WHERE b."createdAt" >= ${from}::timestamp AND b."createdAt" < ${to}::timestamp
        GROUP BY 1
        ORDER BY 1
      `;

      const revenue = await tx.$queryRaw<Array<{ date: string; value: number }>>`
        SELECT
          to_char(
            date_trunc(${bucketSql}::text, (i."paidAt" AT TIME ZONE 'UTC'::text) AT TIME ZONE ${timezoneSql}::text),
            ${formatSql}
          ) AS date,
          COALESCE(sum(i.amount), 0)::float AS value
        FROM invoices i
        WHERE i.status = 'PAID'
          AND i."paidAt" >= ${from}::timestamp AND i."paidAt" < ${to}::timestamp
        GROUP BY 1
        ORDER BY 1
      `;

      const created = await tx.$queryRaw<Array<{ date: string; value: number }>>`
        SELECT
          to_char(
            date_trunc(${bucketSql}::text, (a."createdAt" AT TIME ZONE 'UTC'::text) AT TIME ZONE ${timezoneSql}::text),
            ${formatSql}
          ) AS date,
          count(*)::int AS value
        FROM appointments a
        WHERE a."createdAt" >= ${from}::timestamp AND a."createdAt" < ${to}::timestamp
        GROUP BY 1
        ORDER BY 1
      `;

      const completed = await tx.$queryRaw<Array<{ date: string; value: number }>>`
        SELECT
          to_char(
            date_trunc(${bucketSql}::text, (a."completedAt" AT TIME ZONE 'UTC'::text) AT TIME ZONE ${timezoneSql}::text),
            ${formatSql}
          ) AS date,
          count(*)::int AS value
        FROM appointments a
        WHERE a.status = 'COMPLETED'
          AND a."completedAt" >= ${from}::timestamp AND a."completedAt" < ${to}::timestamp
        GROUP BY 1
        ORDER BY 1
      `;

      return [mrr, shops, revenue, created, completed] as const;
    },
  );

  const denseKeys: string[] = mrrRows.map((row: { date: string }) => row.date);
  if (denseKeys.length === 0) return null;

  const index = new Map<string, number>(denseKeys.map((key: string, position: number) => [key, position]));
  const fill = (rows: Array<{ date: string; value: number }>): number[] => {
    const values = new Array(denseKeys.length).fill(0);
    for (const row of rows) {
      const position = index.get(row.date);
      if (position !== undefined) values[position] = row.value;
    }
    return values;
  };

  return {
    series: denseKeys,
    mrr: fill(mrrRows),
    newShops: fill(shopsRows),
    revenue: fill(revenueRows),
    appointmentsCreated: fill(createdRows),
    appointmentsCompleted: fill(completedRows),
  };
}

export async function getAdminOverview(period: OverviewPeriod): Promise<AdminOverviewPayload> {
  return readThrough(`admin:overview:${period}`, () => buildOverview(period));
}

export function clearOverviewCache(): void {
  overviewCache.clear();
}
