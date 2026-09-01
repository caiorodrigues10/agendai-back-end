import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import { CrmClientMetrics, CrmOverviewDTO, CrmSegment } from "../../dtos/ICrmDTO";
import { ICrmRepository } from "../../repositories/ICrmRepository";

const round = (value: number) => Math.round(value * 100) / 100;
const dayMs = 86_400_000;

function segmentFor(metrics: Omit<CrmClientMetrics, "segment">): CrmSegment {
  if (metrics.outstanding > 0) return "debtors";
  if (metrics.activePackageSessions > 0 && metrics.nextExpectedVisitAt) return "package_expiring";
  if ((metrics.daysSinceLastVisit ?? 0) >= 90) return "inactive_90";
  if ((metrics.daysSinceLastVisit ?? 0) >= 60) return "inactive_60";
  if ((metrics.daysSinceLastVisit ?? 0) >= 30) return "inactive_30";
  if (metrics.risk === "high") return "at_risk";
  if (metrics.visits >= 5) return "vip";
  if (metrics.visits >= 2) return "recurring";
  return "new";
}

function buildClientMetrics(client: {
  id: string; name: string; whatsapp: string; marketingOptIn: boolean;
  financialEvents: Array<{ grossAmount: number; receivedAmount: number; outstandingDelta: number; occurredAt: Date }>;
  queueItems: Array<{ completedAt: Date | null; service: { name: string } }>;
  packages: Array<{ remainingSessions: number; status: string }>;
}): CrmClientMetrics {
  const events = client.financialEvents;
  const visits = client.queueItems.filter((item) => item.completedAt);
  const visitDates = visits.map((item) => item.completedAt!).sort((a, b) => a.getTime() - b.getTime());
  const grossRevenue = events.reduce((sum, event) => sum + event.grossAmount, 0);
  const receivedRevenue = events.reduce((sum, event) => sum + event.receivedAmount, 0);
  const outstanding = events.reduce((sum, event) => sum + event.outstandingDelta, 0);
  const intervals = visitDates.slice(1).map((date, index) => (date.getTime() - visitDates[index].getTime()) / dayMs);
  const averageInterval = intervals.length ? intervals.reduce((sum, value) => sum + value, 0) / intervals.length : null;
  const lastVisit = visitDates.at(-1) ?? null;
  const now = Date.now();
  const daysSinceLastVisit = lastVisit ? Math.floor((now - lastVisit.getTime()) / dayMs) : null;
  const risk: "low" | "medium" | "high" = !lastVisit || (averageInterval && daysSinceLastVisit! > averageInterval * 1.5) || (daysSinceLastVisit ?? 0) >= 45 ? "high" : (daysSinceLastVisit ?? 0) >= 25 ? "medium" : "low";
  const services = new Map<string, number>();
  visits.forEach((visit) => services.set(visit.service.name, (services.get(visit.service.name) ?? 0) + 1));
  const favoriteService = [...services.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const activePackageSessions = client.packages.filter((pkg) => pkg.status === "ACTIVE").reduce((sum, pkg) => sum + pkg.remainingSessions, 0);
  const partial = {
    clientId: client.id, name: client.name, whatsapp: client.whatsapp, marketingOptIn: client.marketingOptIn,
    grossRevenue: round(grossRevenue), receivedRevenue: round(receivedRevenue), outstanding: round(outstanding), ltv: round(receivedRevenue),
    visits: visits.length, avgTicket: visits.length ? round(grossRevenue / visits.length) : 0,
    firstVisitAt: visitDates[0]?.toISOString() ?? null, lastVisitAt: lastVisit?.toISOString() ?? null,
    nextExpectedVisitAt: lastVisit && averageInterval ? new Date(lastVisit.getTime() + averageInterval * dayMs).toISOString() : null,
    daysSinceLastVisit, risk, favoriteService, activePackageSessions,
  };
  return { ...partial, segment: segmentFor(partial) };
}

export class CrmRepository implements ICrmRepository {
  private async metrics(barbershopId: string): Promise<CrmClientMetrics[]> {
    const clients = await prisma.salonClient.findMany({
      where: { barbershopId },
      include: {
        financialEvents: { orderBy: { occurredAt: "asc" } },
        queueItems: { where: { status: "COMPLETED" }, select: { completedAt: true, service: { select: { name: true } } } },
        packages: { select: { remainingSessions: true, status: true } },
      },
    });
    return clients.map(buildClientMetrics);
  }

  async overview(barbershopId: string, from: Date, to: Date, compare: boolean): Promise<CrmOverviewDTO> {
    const [events, packages, appointments, metrics] = await Promise.all([
      prisma.crmFinancialEvent.findMany({ where: { barbershopId, occurredAt: { gte: from, lte: to } }, orderBy: { occurredAt: "asc" } }),
      prisma.clientPackage.findMany({ where: { barbershopId, purchasedAt: { gte: from, lte: to }, status: { not: "CANCELLED" } }, select: { pricePaid: true } }),
      prisma.appointment.findMany({ where: { barbershopId, date: { gte: from, lte: to } }, select: { status: true } }),
      this.metrics(barbershopId),
    ]);
    const dayMap = new Map<string, { grossRevenue: number; receivedRevenue: number; visits: number }>();
    for (const event of events) {
      const key = event.occurredAt.toISOString().slice(0, 10);
      const current = dayMap.get(key) ?? { grossRevenue: 0, receivedRevenue: 0, visits: 0 };
      current.grossRevenue += event.grossAmount; current.receivedRevenue += event.receivedAmount;
      if (event.kind === "SERVICE_COMPLETED") current.visits += 1;
      dayMap.set(key, current);
    }
    const grossRevenue = events.reduce((sum: number, event: any) => sum + event.grossAmount, 0);
    const receivedRevenue = events.reduce((sum: number, event: any) => sum + event.receivedAmount, 0);
    const visits = events.filter((event: any) => event.kind === "SERVICE_COMPLETED").length;
    const firstTime = metrics.filter((metric) => metric.firstVisitAt && new Date(metric.firstVisitAt) >= from && new Date(metric.firstVisitAt) <= to).length;
    const recurring = metrics.filter((metric) => metric.visits >= 2 && metric.lastVisitAt && new Date(metric.lastVisitAt) >= from && new Date(metric.lastVisitAt) <= to).length;
    const reactivated = metrics.filter((metric) => metric.daysSinceLastVisit !== null && metric.daysSinceLastVisit < 30 && metric.visits >= 2).length;
    const inactive = metrics.filter((metric) => (metric.daysSinceLastVisit ?? 0) >= 30).length;
    const atRisk = metrics.filter((metric) => metric.risk === "high");
    const intervals = metrics.map((metric) => metric.nextExpectedVisitAt && metric.lastVisitAt ? (new Date(metric.nextExpectedVisitAt).getTime() - new Date(metric.lastVisitAt).getTime()) / dayMs : null).filter((value): value is number => value !== null);
    const duration = to.getTime() - from.getTime();
    let previous: CrmOverviewDTO["compare"] = null;
    if (compare) {
      const previousEvents = await prisma.crmFinancialEvent.findMany({ where: { barbershopId, occurredAt: { gte: new Date(from.getTime() - duration), lt: from } } });
      previous = { grossRevenue: round(previousEvents.reduce((sum: number, event: any) => sum + event.grossAmount, 0)), receivedRevenue: round(previousEvents.reduce((sum: number, event: any) => sum + event.receivedAmount, 0)), customers: new Set(previousEvents.map((event: any) => event.clientId)).size };
    }
    const labels: Record<CrmSegment, string> = { all: "Todos", new: "Novos", recurring: "Recorrentes", vip: "VIP", at_risk: "Em risco", inactive_30: "Inativos 30d", inactive_60: "Inativos 60d", inactive_90: "Inativos 90d", debtors: "Devedores", package_expiring: "Pacotes", low_demand: "Dias de baixa" };
    const segmentKeys: CrmSegment[] = ["new", "recurring", "vip", "at_risk", "inactive_30", "debtors", "package_expiring"];
    return {
      from: from.toISOString(), to: to.toISOString(), compare: previous,
      kpis: { grossRevenue: round(grossRevenue), receivedRevenue: round(receivedRevenue), outstanding: round(metrics.reduce((sum: number, metric: CrmClientMetrics) => sum + metric.outstanding, 0)), avgTicket: visits ? round(grossRevenue / visits) : 0, newCustomers: firstTime, recurringCustomers: recurring, reactivatedCustomers: reactivated, inactiveCustomers: inactive, retentionRate: metrics.length ? round((recurring / metrics.length) * 100) : 0, averageVisitIntervalDays: intervals.length ? round(intervals.reduce((sum: number, value: number) => sum + value, 0) / intervals.length) : null, packageSales: round(packages.reduce((sum: number, item: { pricePaid: number }) => sum + item.pricePaid, 0)), packageSessions: metrics.reduce((sum: number, metric: CrmClientMetrics) => sum + metric.activePackageSessions, 0), revenueAtRisk: round(atRisk.reduce((sum: number, metric: CrmClientMetrics) => sum + metric.ltv, 0)) },
      byDay: [...dayMap.entries()].map(([date, value]) => ({ date, grossRevenue: round(value.grossRevenue), receivedRevenue: round(value.receivedRevenue), visits: value.visits })),
      topClients: [...metrics].sort((a, b) => b.ltv - a.ltv).slice(0, 8),
      segments: segmentKeys.map((segment) => { const matched = metrics.filter((metric) => metric.segment === segment); return { segment, label: labels[segment], count: matched.length, potential: round(matched.reduce((sum: number, metric: CrmClientMetrics) => sum + metric.ltv, 0)) }; }),
    };
  }

  async listClients(barbershopId: string, params: { page: number; limit: number; search?: string; segment?: CrmSegment; sort?: "ltv" | "lastVisit" | "outstanding" }): Promise<{ data: CrmClientMetrics[]; total: number }> {
    let records = await this.metrics(barbershopId);
    if (params.search) { const term = params.search.toLowerCase(); records = records.filter((item) => item.name.toLowerCase().includes(term) || item.whatsapp.includes(term.replace(/\D/g, ""))); }
    if (params.segment && params.segment !== "all") records = records.filter((item) => item.segment === params.segment);
    const sort = params.sort ?? "ltv";
    records.sort((a, b) => sort === "lastVisit" ? (new Date(b.lastVisitAt ?? 0).getTime() - new Date(a.lastVisitAt ?? 0).getTime()) : b[sort] - a[sort]);
    const total = records.length;
    return { data: records.slice((params.page - 1) * params.limit, params.page * params.limit), total };
  }

  async getClientProfile(barbershopId: string, clientId: string): Promise<Record<string, unknown> | null> {
    const client = await prisma.salonClient.findFirst({ where: { id: clientId, barbershopId }, include: { financialEvents: { orderBy: { occurredAt: "desc" } }, queueItems: { orderBy: { joinedAt: "desc" }, take: 100, include: { service: { select: { name: true } } } }, appointments: { orderBy: { date: "desc" }, take: 50, include: { service: { select: { name: true } } } }, fiados: { include: { payments: true }, orderBy: { createdAt: "desc" } }, packages: { include: { service: { select: { name: true } } }, orderBy: { purchasedAt: "desc" } } } });
    if (!client) return null;
    const metric = buildClientMetrics({ ...client, queueItems: client.queueItems.filter((item: any) => item.status === "COMPLETED").map((item: any) => ({ completedAt: item.completedAt, service: item.service })) });
    return { ...metric, client: { id: client.id, name: client.name, whatsapp: client.whatsapp, notes: client.notes, marketingOptIn: client.marketingOptIn, marketingOptInAt: client.marketingOptInAt }, timeline: client.financialEvents, appointments: client.appointments, fiados: client.fiados, packages: client.packages };
  }

  async mergeClients(barbershopId: string, targetId: string, sourceIds: string[]): Promise<void> {
    const ids = [...new Set(sourceIds.filter((id) => id !== targetId))];
    if (!ids.length) throw new AppError("Selecione ao menos um cliente duplicado", 400);
    await prisma.$transaction(async (tx: any) => {
      const clients = await tx.salonClient.findMany({ where: { barbershopId, id: { in: [targetId, ...ids] } }, select: { id: true } });
      if (clients.length !== ids.length + 1) throw new AppError("Cliente inválido para este salão", 404);
      const sourceRecipients = await tx.crmCampaignRecipient.findMany({
        where: { clientId: { in: ids } },
        select: { id: true, campaignId: true },
      });
      const targetCampaignIds = new Set((await tx.crmCampaignRecipient.findMany({
        where: { clientId: targetId },
        select: { campaignId: true },
      })).map((recipient: { campaignId: string }) => recipient.campaignId));

      for (const recipient of sourceRecipients) {
        if (targetCampaignIds.has(recipient.campaignId)) {
          await tx.crmCampaignRecipient.delete({ where: { id: recipient.id } });
        } else {
          await tx.crmCampaignRecipient.update({ where: { id: recipient.id }, data: { clientId: targetId } });
          targetCampaignIds.add(recipient.campaignId);
        }
      }

      await Promise.all([tx.appointment.updateMany({ where: { clientId: { in: ids } }, data: { clientId: targetId } }), tx.queueItem.updateMany({ where: { clientId: { in: ids } }, data: { clientId: targetId } }), tx.fiado.updateMany({ where: { clientId: { in: ids } }, data: { clientId: targetId } }), tx.clientPackage.updateMany({ where: { clientId: { in: ids } }, data: { clientId: targetId } }), tx.crmFinancialEvent.updateMany({ where: { clientId: { in: ids } }, data: { clientId: targetId } })]);
      await tx.salonClient.deleteMany({ where: { id: { in: ids }, barbershopId } });
    });
  }
}
