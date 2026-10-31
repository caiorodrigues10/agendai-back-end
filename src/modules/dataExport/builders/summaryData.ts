/**
 * Dados do Resumo — a "fotografia" do período.
 *
 * Os números vêm dos MESMOS repositories do motor de lucro do app
 * (`ProfitRepository` + `summarizeRetailFinancials`) e do cálculo compartilhado
 * (`calculateProfit`), então o total da planilha é igual ao do relatório.
 */
import { prisma } from "@/libs/prismaClient";
import { ProfitRepository } from "@/modules/profit/profitRepository";
import { calculateProfit } from "@/modules/profit/profitCalculator";
import { summarizeRetailFinancials } from "@/modules/products/utils/retailSummary";

export interface SummaryRange {
  from: Date | null;
  to: Date | null;
}

export interface PaymentBreakdown {
  method: string;
  count: number;
  total: number;
}

export interface StaffBreakdown {
  staffId: string | null;
  name: string;
  count: number;
  revenue: number;
  commission: number;
}

export interface ServiceBreakdown {
  serviceId: string | null;
  name: string;
  count: number;
  revenue: number;
}

export interface PeriodSummary {
  revenue: number;
  serviceRevenue: number;
  productRevenue: number;
  expenses: number;
  netProfit: number;
  marginPercent: number;
  commissions: number;
  taxAmount: number;
  totalAppointments: number;
  completedCount: number;
  canceledCount: number;
  noShowCount: number;
  scheduledCount: number;
  ticketAverage: number;
  newClients: number;
  activeClients: number;
  byPaymentMethod: PaymentBreakdown[];
  byStaff: StaffBreakdown[];
  byService: ServiceBreakdown[];
  byWeekday: Array<{ weekday: string; count: number; total: number }>;
  byHour: Array<{ hour: string; count: number; total: number }>;
}

function rangeFilter(range: SummaryRange): { gte?: Date; lte?: Date } {
  if (!range.from || !range.to) return {};
  return { gte: range.from, lte: range.to };
}

/**
 * Calcula o resumo do período.
 *
 * @param barbershopId salão
 * @param range        intervalo (null = tudo)
 */
export async function computePeriodSummary(
  barbershopId: string,
  range: SummaryRange,
): Promise<PeriodSummary> {
  const repo = new ProfitRepository();
  const filter = rangeFilter(range);
  const hasRange = Boolean(filter.gte && filter.lte);
  const profitRange = {
    start: filter.gte ?? new Date(1970, 0, 1),
    end: filter.lte ?? new Date(2100, 0, 1),
  };

  const [appointments, queueItems, expenses, commissions, retail, settings] = await Promise.all([
    repo.getCompletedAppointments(barbershopId, profitRange),
    repo.getQueueCompletions(barbershopId, profitRange),
    repo.getExpenses(barbershopId, profitRange),
    repo.getCommissions(barbershopId, profitRange),
    summarizeRetailFinancials(barbershopId, hasRange ? filter : undefined),
    repo.getSettings(barbershopId),
  ]);

  const calculation = calculateProfit({
    appointments,
    queueItems,
    expenses,
    commissions,
    retail,
    settings: {
      defaultTaxRate: settings?.defaultTaxRate ?? 0,
      defaultCommission: settings?.defaultCommission ?? 0,
      overheadCategories: (settings?.overheadCategories ?? {}) as Record<string, unknown>,
    },
  });
  const { summary, byService, byStaff } = calculation;

  // ── Contagens por situação (mesma janela do relatório) ────────────────────
  const statusWhere = {
    barbershopId,
    ...(hasRange ? { date: filter } : {}),
  };
  const [completedCount, canceledCount, noShowCount, scheduledCount, newClients] =
    await Promise.all([
      prisma.appointment.count({ where: { ...statusWhere, status: "COMPLETED" } }),
      prisma.appointment.count({ where: { ...statusWhere, status: "CANCELLED" } }),
      prisma.appointment.count({ where: { ...statusWhere, status: "NO_SHOW" } }),
      prisma.appointment.count({
        where: { ...statusWhere, status: { in: ["CONFIRMED", "CHECKED_IN"] } },
      }),
      prisma.salonClient.count({
        where: { barbershopId, ...(hasRange ? { createdAt: filter } : {}) },
      }),
    ]);

  // ── Clientes ativos (com atendimento no período) ──────────────────────────
  const activeClientIds = await prisma.appointment.findMany({
    where: { ...statusWhere, status: "COMPLETED", clientId: { not: null } },
    select: { clientId: true },
    distinct: ["clientId"],
  });
  const activeClients = activeClientIds.filter((row) => row.clientId).length;

  // ── Por forma de pagamento ────────────────────────────────────────────────
  const paymentRows = await prisma.appointment.findMany({
    where: { ...statusWhere, status: "COMPLETED" },
    select: { paymentMethod: true, finalPrice: true, service: { select: { price: true } } },
  });
  const paymentMap = new Map<string, { count: number; total: number }>();
  for (const row of paymentRows) {
    const method = row.paymentMethod?.trim() || "Não informado";
    const current = paymentMap.get(method) ?? { count: 0, total: 0 };
    const value = Number(row.finalPrice ?? row.service?.price ?? 0);
    paymentMap.set(method, { count: current.count + 1, total: current.total + value });
  }
  const byPaymentMethod = [...paymentMap.entries()]
    .map(([method, data]) => ({ method, count: data.count, total: data.total }))
    .sort((a, b) => b.total - a.total);

  // ── Por dia da semana e por hora ──────────────────────────────────────────
  const completedRows = await prisma.appointment.findMany({
    where: { ...statusWhere, status: "COMPLETED" },
    select: { date: true, time: true, finalPrice: true, service: { select: { price: true } } },
  });
  const weekdayMap = new Map<string, { count: number; total: number }>();
  const hourMap = new Map<string, { count: number; total: number }>();
  for (const row of completedRows) {
    const value = Number(row.finalPrice ?? row.service?.price ?? 0);
    const weekday = row.date.toLocaleDateString("pt-BR", { weekday: "long", timeZone: "UTC" });
    const weekdayKey = weekday.charAt(0).toUpperCase() + weekday.slice(1);
    const wCurrent = weekdayMap.get(weekdayKey) ?? { count: 0, total: 0 };
    weekdayMap.set(weekdayKey, { count: wCurrent.count + 1, total: wCurrent.total + value });

    const hour = row.time?.slice(0, 2) ?? "";
    if (hour) {
      const hCurrent = hourMap.get(hour) ?? { count: 0, total: 0 };
      hourMap.set(hour, { count: hCurrent.count + 1, total: hCurrent.total + value });
    }
  }

  // ── Nomes de serviços e profissionais ─────────────────────────────────────
  const staffIds = [...byStaff.keys()].filter((id): id is string => Boolean(id));
  const serviceIds = [...byService.keys()].filter((id): id is string => Boolean(id));
  const [staffs, services] = await Promise.all([
    staffIds.length
      ? prisma.user.findMany({
          where: { id: { in: staffIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    serviceIds.length
      ? prisma.service.findMany({
          where: { id: { in: serviceIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);
  const staffName = new Map(staffs.map((s) => [s.id, s.name]));
  const serviceName = new Map(services.map((s) => [s.id, s.name]));

  return {
    revenue: summary.totalRevenue,
    serviceRevenue: summary.serviceRevenue,
    productRevenue: summary.productRevenue,
    expenses: summary.totalExpenses,
    netProfit: summary.netProfit,
    marginPercent: summary.marginPercent,
    commissions: summary.totalCommission,
    taxAmount: summary.totalTax,
    totalAppointments: summary.totalAppointments,
    completedCount,
    canceledCount,
    noShowCount,
    scheduledCount,
    ticketAverage:
      summary.totalAppointments > 0 ? summary.totalRevenue / summary.totalAppointments : 0,
    newClients,
    activeClients,
    byPaymentMethod,
    byStaff: [...byStaff.entries()]
      .map(([staffId, data]) => ({
        staffId,
        name: staffName.get(staffId) ?? "Sem profissional",
        count: data.count,
        revenue: data.revenue,
        commission: data.commission,
      }))
      .sort((a, b) => b.revenue - a.revenue),
    byService: [...byService.entries()]
      .map(([serviceId, data]) => ({
        serviceId,
        name: serviceName.get(serviceId) ?? "Serviço removido",
        count: data.count,
        revenue: data.revenue,
      }))
      .sort((a, b) => b.revenue - a.revenue),
    byWeekday: [...weekdayMap.entries()]
      .map(([weekday, data]) => ({ weekday, count: data.count, total: data.total }))
      .sort((a, b) => b.count - a.count),
    byHour: [...hourMap.entries()]
      .map(([hour, data]) => ({ hour: `${hour}:00`, count: data.count, total: data.total }))
      .sort((a, b) => a.hour.localeCompare(b.hour)),
  };
}
