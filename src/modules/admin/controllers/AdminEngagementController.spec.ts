import { describe, it, expect, beforeEach, vi } from "vitest";
import { AdminEngagementController } from "./AdminEngagementController";

const prismaMock = vi.hoisted(() => ({
  barbershop: { count: vi.fn(), findMany: vi.fn() },
  service: { groupBy: vi.fn() },
  product: { groupBy: vi.fn() },
  appointment: { groupBy: vi.fn() },
  queueItem: { groupBy: vi.fn() },
  retailSale: { groupBy: vi.fn() },
  fiado: { groupBy: vi.fn() },
  clientReview: { groupBy: vi.fn() },
  ticket: { findMany: vi.fn(), count: vi.fn() },
  ticketComment: { groupBy: vi.fn() },
  subscription: { findMany: vi.fn() },
}));

vi.mock("@/libs/prismaClient", () => ({
  prisma: prismaMock,
  Prisma: { TransactionClient: class {} },
}));

const controller = new AdminEngagementController();

function makeReply() {
  return {
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };
}

function makeRequest() {
  return { user: { id: "master-1", role: "MASTER_ADMIN" } } as never;
}

type SummarySent = {
  data: {
    funnel: Array<{ key: string; count: number; pct: number }>;
    features: Array<{ key: string; shops: number; pct: number }>;
    nps: { responses: number; promoters: number; score: number | null };
    support: {
      open: number;
      openOver24h: number;
      resolved30d: number;
      avgResolutionH: number | null;
      avgFirstResponseH: number | null;
    };
    churnRisk: Array<{ id: string; score: number; reasons: string[] }>;
  };
};

/** Ordem exata dos args do Promise.all do controller. */
function mockAll(
  overrides: Partial<{
    total: number;
    onboarded: number;
    services: Array<{ barbershopId: string }>;
    catalog: Array<{ barbershopId: string }>;
    appointmentsAll: Array<{ barbershopId: string }>;
    appointments30d: Array<{ barbershopId: string }>;
    appointments7d: Array<{ barbershopId: string }>;
    queue30d: Array<{ barbershopId: string }>;
    queue7d: Array<{ barbershopId: string }>;
    retail30d: Array<{ barbershopId: string }>;
    fiado30d: Array<{ barbershopId: string }>;
    reviews: Array<{ rating: number; _count: { _all: number } }>;
    tickets: Array<{ id: string; createdAt: Date; resolvedAt: Date | null }>;
    comments: Array<{ ticketId: string; _min: { createdAt: Date | null } }>;
    openBacklog: number;
    openOver24h: number;
    lateSubs: Array<{ barbershopId: string }>;
    trialEnding: Array<{ barbershopId: string }>;
    shops: Array<{ id: string; name: string; createdAt: Date }>;
  }> = {},
) {
  const old = new Date(Date.now() - 90 * 86_400_000);
  const recent = new Date(Date.now() - 5 * 86_400_000);

  prismaMock.barbershop.count
    .mockResolvedValueOnce(overrides.total ?? 10)
    .mockResolvedValueOnce(overrides.onboarded ?? 6);
  prismaMock.service.groupBy.mockResolvedValueOnce(overrides.services ?? []);
  prismaMock.product.groupBy.mockResolvedValueOnce(overrides.catalog ?? []);
  prismaMock.appointment.groupBy
    .mockResolvedValueOnce(overrides.appointmentsAll ?? [])
    .mockResolvedValueOnce(overrides.appointments30d ?? [])
    .mockResolvedValueOnce(overrides.appointments7d ?? []);
  prismaMock.queueItem.groupBy
    .mockResolvedValueOnce(overrides.queue30d ?? [])
    .mockResolvedValueOnce(overrides.queue7d ?? []);
  prismaMock.retailSale.groupBy.mockResolvedValueOnce(overrides.retail30d ?? []);
  prismaMock.fiado.groupBy.mockResolvedValueOnce(overrides.fiado30d ?? []);
  prismaMock.clientReview.groupBy.mockResolvedValueOnce(overrides.reviews ?? []);
  prismaMock.ticket.findMany.mockResolvedValueOnce(overrides.tickets ?? []);
  prismaMock.ticketComment.groupBy.mockResolvedValueOnce(overrides.comments ?? []);
  prismaMock.ticket.count
    .mockResolvedValueOnce(overrides.openBacklog ?? 0)
    .mockResolvedValueOnce(overrides.openOver24h ?? 0);
  prismaMock.subscription.findMany
    .mockResolvedValueOnce(overrides.lateSubs ?? [])
    .mockResolvedValueOnce(overrides.trialEnding ?? []);
  prismaMock.barbershop.findMany.mockResolvedValueOnce(
    overrides.shops ?? [{ id: "b1", name: "Barbearia Central", createdAt: recent }],
  );
}

describe("AdminEngagementController.summary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("monta funil, features, NPS e suporte a partir dos agregados", async () => {
    mockAll({
      total: 100,
      onboarded: 60,
      services: [{ barbershopId: "b1" }, { barbershopId: "b2" }],
      catalog: [{ barbershopId: "b2" }],
      appointmentsAll: [{ barbershopId: "b1" }, { barbershopId: "b2" }],
      appointments30d: [{ barbershopId: "b1" }],
      appointments7d: [{ barbershopId: "b1" }],
      queue30d: [{ barbershopId: "b1" }],
      queue7d: [],
      retail30d: [{ barbershopId: "b2" }],
      fiado30d: [],
      reviews: [
        { rating: 5, _count: { _all: 6 } },
        { rating: 3, _count: { _all: 2 } },
        { rating: 1, _count: { _all: 2 } },
      ],
      openBacklog: 12,
      openOver24h: 3,
    });

    const reply = makeReply();
    await controller.summary(makeRequest(), reply as never);

    const sent = vi.mocked(reply.send).mock.calls[0][0] as SummarySent;
    expect(sent.data.funnel.map((s: { key: string }) => s.key)).toEqual([
      "total",
      "services",
      "catalog",
      "onboarding",
      "firstAppointment",
      "active7d",
    ]);
    expect(sent.data.funnel[0]).toMatchObject({ count: 100, pct: 100 });
    expect(sent.data.funnel[1]).toMatchObject({ count: 2, pct: 2 });
    expect(sent.data.funnel[5]).toMatchObject({ count: 1, pct: 1 });
    expect(sent.data.features.find((f: { key: string }) => f.key === "agenda")).toEqual({
      key: "agenda",
      label: "Agenda",
      shops: 1,
      pct: 1,
    });
    expect(sent.data.nps).toMatchObject({ responses: 10, promoters: 6, score: 40 });
    expect(sent.data.support).toMatchObject({
      open: 12,
      openOver24h: 3,
      resolved30d: 0,
      avgResolutionH: null,
      avgFirstResponseH: null,
    });
  });

  it("calcula resolução, primeira resposta e risco de churn com motivos", async () => {
    const now = Date.now();
    const created = new Date(now - 48 * 3_600_000);
    const resolved = new Date(now - 24 * 3_600_000);
    const firstComment = new Date(now - 46 * 3_600_000);

    mockAll({
      total: 2,
      appointments30d: [],
      tickets: [
        { id: "t1", createdAt: created, resolvedAt: resolved },
        { id: "t2", createdAt: created, resolvedAt: null },
      ],
      comments: [{ ticketId: "t1", _min: { createdAt: firstComment } }],
      lateSubs: [{ barbershopId: "b2" }],
      trialEnding: [{ barbershopId: "b1" }],
      shops: [
        { id: "b1", name: "Alpha", createdAt: new Date(now - 60 * 86_400_000) },
        { id: "b2", name: "Beta", createdAt: new Date(now - 60 * 86_400_000) },
      ],
    });

    const reply = makeReply();
    await controller.summary(makeRequest(), reply as never);

    const sent = vi.mocked(reply.send).mock.calls[0][0] as SummarySent;
    expect(sent.data.support.resolved30d).toBe(1);
    expect(sent.data.support.avgResolutionH).toBe(24);
    expect(sent.data.support.avgFirstResponseH).toBe(2);
    // b1: trial + inativo; b2: atraso + inativo → score 2 cada, ordena por nome.
    expect(sent.data.churnRisk).toEqual([
      { id: "b1", name: "Alpha", score: 2, reasons: ["Trial terminando em até 7 dias", "Sem atividade há 30 dias"] },
      { id: "b2", name: "Beta", score: 2, reasons: ["Assinatura em atraso", "Sem atividade há 30 dias"] },
    ]);
  });

  it("retorna NPS nulo, suporte vazio e sem risco quando não há dados", async () => {
    mockAll({ total: 0, shops: [] });

    const reply = makeReply();
    await controller.summary(makeRequest(), reply as never);

    const sent = vi.mocked(reply.send).mock.calls[0][0] as SummarySent;
    expect(sent.data.nps).toMatchObject({ responses: 0, score: null });
    expect(sent.data.support).toMatchObject({
      open: 0,
      avgResolutionH: null,
      avgFirstResponseH: null,
    });
    expect(sent.data.churnRisk).toEqual([]);
    expect(sent.data.features.every((f: { pct: number }) => f.pct === 0)).toBe(true);
  });
});
