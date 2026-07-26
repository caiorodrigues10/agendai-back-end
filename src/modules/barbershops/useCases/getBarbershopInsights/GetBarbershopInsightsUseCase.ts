import { prisma } from "@/libs/prismaClient";

export type InsightsPeriod = "7d" | "30d" | "90d";

export interface BarbershopInsightsDTO {
  period: InsightsPeriod;
  from: string;
  to: string;
  kpis: {
    revenue: number;
    completedServices: number;
    avgTicket: number;
    avgWaitMinutes: number | null;
    queueCancelRate: number;
    appointmentCancelRate: number;
    returningCustomerRate: number;
    uniqueCustomers: number;
    expenses: number;
    netProfit: number;
    openFiado: number;
    overdueFiado: number;
  };
  byWeekday: Array<{ day: string; label: string; volume: number; revenue: number }>;
  byHour: Array<{ hour: number; label: string; volume: number }>;
  topServices: Array<{
    serviceId: string;
    name: string;
    count: number;
    revenue: number;
  }>;
  byStaff: Array<{
    staffId: string;
    name: string;
    count: number;
    revenue: number;
  }>;
  appointments: {
    total: number;
    confirmed: number;
    completed: number;
    cancelled: number;
  };
  inactiveCustomers: Array<{
    whatsapp: string;
    customerName: string;
    lastVisitAt: string;
    daysSince: number;
    visits: number;
  }>;
  /** Frases acionáveis geradas a partir dos números */
  highlights: string[];
}

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function periodDays(period: InsightsPeriod): number {
  if (period === "7d") return 7;
  if (period === "90d") return 90;
  return 30;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function normalizeWhatsapp(w: string): string {
  return w.replace(/\D/g, "");
}

export class GetBarbershopInsightsUseCase {
  async execute(
    barbershopId: string,
    period: InsightsPeriod = "30d"
  ): Promise<BarbershopInsightsDTO> {
    const days = periodDays(period);
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - days);
    from.setHours(0, 0, 0, 0);

    const inactiveCutoff = new Date();
    inactiveCutoff.setDate(inactiveCutoff.getDate() - 30);

    const [
      queueItems,
      appointments,
      expenses,
      fiadosOpen,
      staffUsers,
      services,
    ] = await Promise.all([
      prisma.queueItem.findMany({
        where: {
          barbershopId,
          OR: [
            { completedAt: { gte: from, lte: to } },
            { joinedAt: { gte: from, lte: to } },
          ],
        },
        select: {
          id: true,
          serviceId: true,
          customerName: true,
          whatsapp: true,
          joinedAt: true,
          completedAt: true,
          completedBy: true,
          finalPrice: true,
          status: true,
        },
      }),
      prisma.appointment.findMany({
        where: {
          barbershopId,
          date: { gte: from, lte: to },
        },
        select: { status: true, staffId: true, serviceId: true },
      }),
      prisma.expense.findMany({
        where: {
          barbershopId,
          referenceDate: { gte: from, lte: to },
        },
        select: { amount: true },
      }),
      prisma.fiado.findMany({
        where: {
          barbershopId,
          status: { in: ["PENDING", "PARTIAL"] },
        },
        select: {
          originalAmount: true,
          paidAmount: true,
          dueDate: true,
        },
      }),
      prisma.user.findMany({
        where: { barbershopId, active: true },
        select: { id: true, name: true },
      }),
      prisma.service.findMany({
        where: { barbershopId },
        select: { id: true, name: true, price: true },
      }),
    ]);

    const serviceMap = new Map(services.map((s) => [s.id, s]));
    const staffMap = new Map(staffUsers.map((u) => [u.id, u.name]));

    const completed = queueItems.filter(
      (q) =>
        q.status === "COMPLETED" &&
        q.completedAt &&
        q.completedAt >= from &&
        q.completedAt <= to
    );
    const joinedInPeriod = queueItems.filter(
      (q) => q.joinedAt >= from && q.joinedAt <= to
    );

    const revenue = completed.reduce((s, q) => {
      const fallback = serviceMap.get(q.serviceId)?.price ?? 0;
      return s + (q.finalPrice ?? fallback);
    }, 0);

    const waitSamples = completed
      .filter((q) => q.completedAt && q.joinedAt)
      .map((q) => (q.completedAt!.getTime() - q.joinedAt.getTime()) / 60000)
      .filter((m) => m >= 0 && m < 24 * 60);

    const avgWaitMinutes =
      waitSamples.length > 0
        ? round2(waitSamples.reduce((a, b) => a + b, 0) / waitSamples.length)
        : null;

    const queueDenom = joinedInPeriod.length || 1;
    const queueCancelRate = round2(
      (joinedInPeriod.filter((q) => q.status === "CANCELLED").length / queueDenom) * 100
    );

    const apptTotal = appointments.length;
    const apptCancelled = appointments.filter((a) => a.status === "CANCELLED").length;
    const apptCompleted = appointments.filter((a) => a.status === "COMPLETED").length;
    const apptConfirmed = appointments.filter((a) => a.status === "CONFIRMED").length;
    const appointmentCancelRate =
      apptTotal > 0 ? round2((apptCancelled / apptTotal) * 100) : 0;

    // Clientes por WhatsApp
    const byCustomer = new Map<
      string,
      { name: string; visits: number; lastVisit: Date }
    >();
    for (const q of completed) {
      const key = normalizeWhatsapp(q.whatsapp) || q.whatsapp;
      if (!key) continue;
      const prev = byCustomer.get(key);
      const visitAt = q.completedAt!;
      if (!prev) {
        byCustomer.set(key, { name: q.customerName, visits: 1, lastVisit: visitAt });
      } else {
        prev.visits += 1;
        if (visitAt > prev.lastVisit) {
          prev.lastVisit = visitAt;
          prev.name = q.customerName;
        }
      }
    }

    const uniqueCustomers = byCustomer.size;
    const returning = [...byCustomer.values()].filter((c) => c.visits >= 2).length;
    const returningCustomerRate =
      uniqueCustomers > 0 ? round2((returning / uniqueCustomers) * 100) : 0;

    const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
    const now = new Date();
    const openFiado = fiadosOpen.reduce(
      (s, f) => s + (f.originalAmount - f.paidAmount),
      0
    );
    const overdueFiado = fiadosOpen
      .filter((f) => f.dueDate && f.dueDate < now)
      .reduce((s, f) => s + (f.originalAmount - f.paidAmount), 0);

    const byWeekday = WEEKDAY_LABELS.map((label, day) => ({
      day: String(day),
      label,
      volume: 0,
      revenue: 0,
    }));
    const byHour = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      label: `${String(hour).padStart(2, "0")}h`,
      volume: 0,
    }));

    const serviceAgg = new Map<string, { count: number; revenue: number }>();
    const staffAgg = new Map<string, { count: number; revenue: number }>();

    for (const q of completed) {
      const doneAt = q.completedAt;
      if (!doneAt) continue;
      const price = q.finalPrice ?? serviceMap.get(q.serviceId)?.price ?? 0;
      const d = doneAt.getDay();
      const h = doneAt.getHours();
      byWeekday[d].volume += 1;
      byWeekday[d].revenue = round2(byWeekday[d].revenue + price);
      byHour[h].volume += 1;

      const sCur = serviceAgg.get(q.serviceId) ?? { count: 0, revenue: 0 };
      sCur.count += 1;
      sCur.revenue = round2(sCur.revenue + price);
      serviceAgg.set(q.serviceId, sCur);

      if (q.completedBy) {
        const st = staffAgg.get(q.completedBy) ?? { count: 0, revenue: 0 };
        st.count += 1;
        st.revenue = round2(st.revenue + price);
        staffAgg.set(q.completedBy, st);
      }
    }

    const topServices = [...serviceAgg.entries()]
      .map(([serviceId, v]) => ({
        serviceId,
        name: serviceMap.get(serviceId)?.name ?? "Serviço",
        count: v.count,
        revenue: v.revenue,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);

    const byStaff = [...staffAgg.entries()]
      .map(([staffId, v]) => ({
        staffId,
        name: staffMap.get(staffId) ?? "Profissional",
        count: v.count,
        revenue: v.revenue,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);

    const inactiveCustomers = [...byCustomer.entries()]
      .filter(([, c]) => c.lastVisit < inactiveCutoff)
      .map(([whatsapp, c]) => ({
        whatsapp,
        customerName: c.name,
        lastVisitAt: c.lastVisit.toISOString(),
        daysSince: Math.floor(
          (now.getTime() - c.lastVisit.getTime()) / (1000 * 60 * 60 * 24)
        ),
        visits: c.visits,
      }))
      .sort((a, b) => b.daysSince - a.daysSince)
      .slice(0, 10);

    const peakHour = [...byHour].sort((a, b) => b.volume - a.volume)[0];
    const peakDay = [...byWeekday].sort((a, b) => b.volume - a.volume)[0];
    const topService = topServices[0];

    const highlights: string[] = [];
    if (completed.length === 0) {
      highlights.push(
        "Ainda há poucos atendimentos concluídos neste período — use a fila e a agenda para gerar histórico."
      );
    } else {
      if (peakHour && peakHour.volume > 0) {
        highlights.push(
          `Horário de pico: ${peakHour.label} (${peakHour.volume} atendimentos). Reforce a equipe nesse intervalo.`
        );
      }
      if (peakDay && peakDay.volume > 0) {
        highlights.push(
          `Dia mais forte: ${peakDay.label} com ${peakDay.volume} atendimentos e R$ ${peakDay.revenue.toFixed(0)}.`
        );
      }
      if (topService) {
        highlights.push(
          `Serviço campeão: ${topService.name} (R$ ${topService.revenue.toFixed(0)} · ${topService.count}×).`
        );
      }
      if (appointmentCancelRate >= 15) {
        highlights.push(
          `Cancelamentos na agenda em ${appointmentCancelRate}% — vale lembrete WhatsApp 24h antes.`
        );
      } else if (apptTotal > 0) {
        highlights.push(
          `Agenda estável: só ${appointmentCancelRate}% de cancelamentos no período.`
        );
      }
      if (returningCustomerRate > 0) {
        highlights.push(
          `${returningCustomerRate}% dos clientes voltaram neste período (${returning} de ${uniqueCustomers}).`
        );
      }
      if (inactiveCustomers.length > 0) {
        highlights.push(
          `${inactiveCustomers.length} cliente(s) sem visita há 30+ dias — boa lista para reativação.`
        );
      }
      if (overdueFiado > 0) {
        highlights.push(
          `Há R$ ${overdueFiado.toFixed(0)} em fiado vencido — priorize cobrança.`
        );
      }
      if (avgWaitMinutes != null && avgWaitMinutes > 45) {
        highlights.push(
          `Espera média de ${avgWaitMinutes} min — considere mais cadeiras no pico ou enxugar serviços longos.`
        );
      }
    }

    return {
      period,
      from: from.toISOString(),
      to: to.toISOString(),
      kpis: {
        revenue: round2(revenue),
        completedServices: completed.length,
        avgTicket:
          completed.length > 0 ? round2(revenue / completed.length) : 0,
        avgWaitMinutes,
        queueCancelRate,
        appointmentCancelRate,
        returningCustomerRate,
        uniqueCustomers,
        expenses: round2(totalExpenses),
        netProfit: round2(revenue - totalExpenses),
        openFiado: round2(openFiado),
        overdueFiado: round2(overdueFiado),
      },
      byWeekday,
      byHour: byHour.filter((h) => h.volume > 0).length
        ? byHour.filter((h) => h.hour >= 7 && h.hour <= 22)
        : byHour.filter((h) => h.hour >= 8 && h.hour <= 20),
      topServices,
      byStaff,
      appointments: {
        total: apptTotal,
        confirmed: apptConfirmed,
        completed: apptCompleted,
        cancelled: apptCancelled,
      },
      inactiveCustomers,
      highlights,
    };
  }
}
