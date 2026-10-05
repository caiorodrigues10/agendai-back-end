import { FastifyReply, FastifyRequest } from "fastify";
import type { SubscriptionStatus, TicketStatus } from "@prisma/client";
import { prisma } from "@/libs/prismaClient";
import { npsSummary, NpsSummary } from "@/modules/nps/services/npsService";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

const OPEN_TICKET_STATUSES: TicketStatus[] = ["OPEN", "IN_PROGRESS", "WAITING_SHOP"];
const RISK_SUBSCRIPTION_STATUSES: SubscriptionStatus[] = ["PAST_DUE", "UNPAID"];

type GroupRow = { barbershopId: string };
type TicketRow = { id: string; createdAt: Date; resolvedAt: Date | null };
type FirstCommentRow = { ticketId: string; _min: { createdAt: Date | null } };
type ShopRow = { id: string; name: string; createdAt: Date };
type SubscriptionRiskRow = { barbershopId: string };

export type EngagementFunnelStep = {
  key: string;
  label: string;
  count: number;
  pct: number;
};

export type EngagementFeature = {
  key: string;
  label: string;
  shops: number;
  pct: number;
};

export type EngagementChurnRisk = {
  id: string;
  name: string;
  score: number;
  reasons: string[];
};

const pctOf = (count: number, total: number): number =>
  total > 0 ? Math.round((count / total) * 100) : 0;

const shopIds = (rows: GroupRow[]): Set<string> =>
  new Set(rows.map((row: GroupRow) => row.barbershopId));

const avgHours = (diffsMs: number[]): number | null => {
  if (diffsMs.length === 0) return null;
  const total = diffsMs.reduce((sum: number, diff: number) => sum + diff, 0);
  return Math.round((total / diffsMs.length / HOUR_MS) * 10) / 10;
};

/**
 * GET /admin/engagement/summary — engajamento, adoção, NPS, suporte e churn.
 *
 * Funil de ativação por etapa, adoção de features (janela de 30 dias para
 * features dinâmicas), NPS real de `NpsResponse` (janela de 90 dias, com
 * flag de dados insuficientes), métricas de SLA de suporte (backlog, tempo
 * de primeira resposta e resolução) e top 10 de risco de churn com motivos.
 */
export class AdminEngagementController {
  async summary(_request: FastifyRequest, reply: FastifyReply) {
    const now = new Date();
    const since7d = new Date(now.getTime() - 7 * DAY_MS);
    const since30d = new Date(now.getTime() - 30 * DAY_MS);
    const overdue24h = new Date(now.getTime() - 24 * HOUR_MS);
    const trialEndsAt = new Date(now.getTime() + 7 * DAY_MS);
    const shopWhere = { active: true };

    const [
      shopsTotal,
      shopsOnboarded,
      shopsWithServices,
      shopsWithCatalog,
      appointmentsAll,
      appointments30d,
      appointments7d,
      queue30d,
      queue7d,
      retail30d,
      fiado30d,
      ticketsWindow,
      firstComments,
      openBacklog,
      openOver24h,
      lateSubs,
      trialEnding,
      shops,
    ] = await Promise.all([
      prisma.barbershop.count({ where: shopWhere }),
      prisma.barbershop.count({
        where: { ...shopWhere, onboardingCompletedAt: { not: null } },
      }),
      prisma.service.groupBy({ by: ["barbershopId"] }),
      prisma.product.groupBy({ by: ["barbershopId"], where: { active: true } }),
      prisma.appointment.groupBy({ by: ["barbershopId"] }),
      prisma.appointment.groupBy({
        by: ["barbershopId"],
        where: { createdAt: { gte: since30d } },
      }),
      prisma.appointment.groupBy({
        by: ["barbershopId"],
        where: { createdAt: { gte: since7d } },
      }),
      prisma.queueItem.groupBy({
        by: ["barbershopId"],
        where: { joinedAt: { gte: since30d } },
      }),
      prisma.queueItem.groupBy({
        by: ["barbershopId"],
        where: { joinedAt: { gte: since7d } },
      }),
      prisma.retailSale.groupBy({
        by: ["barbershopId"],
        where: { soldAt: { gte: since30d } },
      }),
      prisma.fiado.groupBy({
        by: ["barbershopId"],
        where: { createdAt: { gte: since30d } },
      }),
      prisma.ticket.findMany({
        where: {
          OR: [{ createdAt: { gte: since30d } }, { resolvedAt: { gte: since30d } }],
        },
        select: { id: true, createdAt: true, resolvedAt: true },
      }),
      prisma.ticketComment.groupBy({
        by: ["ticketId"],
        where: { createdAt: { gte: since30d } },
        _min: { createdAt: true },
      }),
      prisma.ticket.count({ where: { status: { in: OPEN_TICKET_STATUSES } } }),
      prisma.ticket.count({
        where: { status: { in: OPEN_TICKET_STATUSES }, createdAt: { lt: overdue24h } },
      }),
      prisma.subscription.findMany({
        where: { status: { in: RISK_SUBSCRIPTION_STATUSES } },
        select: { barbershopId: true },
      }),
      prisma.subscription.findMany({
        where: { status: "TRIALING", endDate: { not: null, lte: trialEndsAt } },
        select: { barbershopId: true },
      }),
      prisma.barbershop.findMany({
        where: shopWhere,
        select: { id: true, name: true, createdAt: true },
      }),
    ]);

    const active7d = new Set([...shopIds(appointments7d), ...shopIds(queue7d)]);
    const active30d = new Set([...shopIds(appointments30d), ...shopIds(queue30d)]);

    const funnelSpecs: Array<{ key: string; label: string; count: number }> = [
      { key: "total", label: "Salões ativos", count: shopsTotal },
      { key: "services", label: "Com serviços cadastrados", count: shopIds(shopsWithServices).size },
      { key: "catalog", label: "Com catálogo de produtos", count: shopIds(shopsWithCatalog).size },
      { key: "onboarding", label: "Onboarding concluído", count: shopsOnboarded },
      { key: "firstAppointment", label: "Com ao menos 1 atendimento", count: shopIds(appointmentsAll).size },
      { key: "active7d", label: "Ativos nos últimos 7 dias", count: active7d.size },
    ];
    const funnel = funnelSpecs.map((step: { key: string; label: string; count: number }) => ({
      ...step,
      pct: pctOf(step.count, shopsTotal),
    }));

    const featureSpecs: Array<{ key: string; label: string; rows: GroupRow[] }> = [
      { key: "agenda", label: "Agenda", rows: appointments30d },
      { key: "queue", label: "Fila", rows: queue30d },
      { key: "retail", label: "Vendas no balcão", rows: retail30d },
      { key: "fiado", label: "Fiado", rows: fiado30d },
      { key: "services", label: "Serviços ativos", rows: shopsWithServices },
      { key: "catalog", label: "Catálogo de produtos", rows: shopsWithCatalog },
    ];
    const features = featureSpecs.map((spec: { key: string; label: string; rows: GroupRow[] }) => {
      const shops = shopIds(spec.rows).size;
      return { key: spec.key, label: spec.label, shops, pct: pctOf(shops, shopsTotal) };
    });

    const nps: NpsSummary = await npsSummary();

    const resolvedInWindow = ticketsWindow.filter(
      (ticket: TicketRow) => ticket.resolvedAt !== null && ticket.resolvedAt >= since30d,
    );
    const resolutionDiffs = resolvedInWindow.map((ticket: TicketRow) =>
      (ticket.resolvedAt as Date).getTime() - ticket.createdAt.getTime(),
    );

    const firstCommentByTicket = new Map<string, Date>();
    firstComments.forEach((row: FirstCommentRow) => {
      if (row._min.createdAt) firstCommentByTicket.set(row.ticketId, row._min.createdAt);
    });
    const firstResponseDiffs: number[] = [];
    ticketsWindow.forEach((ticket: TicketRow) => {
      const first = firstCommentByTicket.get(ticket.id);
      if (first) firstResponseDiffs.push(first.getTime() - ticket.createdAt.getTime());
    });

    const lateIds = new Set(
      lateSubs.map((row: SubscriptionRiskRow) => row.barbershopId),
    );
    const trialIds = new Set(
      trialEnding.map((row: SubscriptionRiskRow) => row.barbershopId),
    );
    const churnRisk: EngagementChurnRisk[] = [];
    shops.forEach((shop: ShopRow) => {
      const reasons: string[] = [];
      if (lateIds.has(shop.id)) reasons.push("Assinatura em atraso");
      if (trialIds.has(shop.id)) reasons.push("Trial terminando em até 7 dias");
      if (shop.createdAt < since30d && !active30d.has(shop.id)) {
        reasons.push("Sem atividade há 30 dias");
      }
      if (reasons.length > 0) {
        churnRisk.push({ id: shop.id, name: shop.name, score: reasons.length, reasons });
      }
    });
    churnRisk.sort(
      (a: EngagementChurnRisk, b: EngagementChurnRisk) =>
        b.score - a.score || a.name.localeCompare(b.name),
    );

    return reply.status(200).send({
      success: true,
      data: {
        generatedAt: now.toISOString(),
        funnel,
        features,
        nps,
        support: {
          open: openBacklog,
          openOver24h,
          resolved30d: resolvedInWindow.length,
          avgResolutionH: avgHours(resolutionDiffs),
          avgFirstResponseH: avgHours(firstResponseDiffs),
        },
        churnRisk: churnRisk.slice(0, 10),
      },
    });
  }
}
