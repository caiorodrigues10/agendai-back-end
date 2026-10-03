import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Readable } from "node:stream";
import { AdminBillingInsightsController } from "./AdminBillingInsightsController";
import { DAY_MS, spMonthStartOffset } from "@/modules/admin/utils/billingPeriod";

const prismaMock = vi.hoisted(() => ({
  invoice: {
    aggregate: vi.fn(),
    groupBy: vi.fn(),
    findMany: vi.fn(),
  },
  subscription: {
    findMany: vi.fn(),
    count: vi.fn(),
  },
}));

vi.mock("@/libs/prismaClient", () => ({
  prisma: prismaMock,
  Prisma: { TransactionClient: class {} },
}));

const controller = new AdminBillingInsightsController();

function makeReply() {
  return {
    status: vi.fn().mockReturnThis(),
    header: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };
}

function makeRequest(query: Record<string, unknown> = {}) {
  return { query, user: { id: "master-1", role: "MASTER_ADMIN" } } as never;
}

/** Soma por faixa derivada da janela (dueDate.gt) pedida na consulta. */
function agingAggregateImpl(now: Date) {
  return vi.fn(async (args: { where: { AND?: Array<{ dueDate?: { gt?: Date } }> } }) => {
    const range = args.where.AND?.[1]?.dueDate;
    // Consulta de previsão (sem janela de faixa): R$ 1000 vencendo em 30d.
    if (!range?.gt) return { _sum: { amount: 1000 }, _count: { _all: 10 } };
    const daysAgo = Math.round((now.getTime() - range.gt.getTime()) / DAY_MS);
    const table: Record<number, { amount: number; count: number }> = {
      7: { amount: 100, count: 1 },
      15: { amount: 200, count: 2 },
      30: { amount: 300, count: 3 },
      60: { amount: 400, count: 4 },
      3650: { amount: 500, count: 5 },
    };
    const bucket = table[daysAgo] ?? { amount: 0, count: 0 };
    return { _sum: { amount: bucket.amount }, _count: { _all: bucket.count } };
  });
}

describe("AdminBillingInsightsController.insights", () => {
  beforeEach(() => vi.clearAllMocks());

  it("agrupa a inadimplência por faixa e soma o total", async () => {
    const now = new Date();
    prismaMock.invoice.aggregate.mockImplementation(agingAggregateImpl(now));
    prismaMock.subscription.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prismaMock.invoice.groupBy.mockResolvedValue([]);
    prismaMock.subscription.count.mockResolvedValue(0);

    const reply = makeReply();
    await controller.insights(makeRequest(), reply as never);

    const sent = vi.mocked(reply.send).mock.calls[0][0] as {
      data: {
        aging: {
          buckets: Array<{ key: string; amount: number; count: number }>;
          totalAmount: number;
          totalCount: number;
        };
      };
    };
    expect(sent.data.aging.buckets.map((b: { key: string }) => b.key)).toEqual([
      "1-7",
      "8-15",
      "16-30",
      "31-60",
      "61+",
    ]);
    expect(sent.data.aging.buckets[0]).toMatchObject({ amount: 100, count: 1 });
    expect(sent.data.aging.buckets[4]).toMatchObject({ amount: 500, count: 5 });
    expect(sent.data.aging.totalAmount).toBe(1500);
    expect(sent.data.aging.totalCount).toBe(15);
  });

  it("calcula ARPA, LTV e churn a partir da base ativa", async () => {
    const now = new Date();
    prismaMock.invoice.aggregate.mockImplementation(agingAggregateImpl(now));
    prismaMock.subscription.findMany
      .mockResolvedValueOnce([]) // coortes
      .mockResolvedValueOnce([
        { plan: { price: 120, billingCycle: "MONTHLY" } },
        { plan: { price: 1200, billingCycle: "YEARLY" } },
      ]);
    prismaMock.invoice.groupBy.mockResolvedValue([
      { status: "PAID", _count: { _all: 9 } },
      { status: "PENDING", _count: { _all: 1 } },
    ]);
    prismaMock.subscription.count.mockResolvedValue(1);

    const reply = makeReply();
    await controller.insights(makeRequest(), reply as never);

    const sent = vi.mocked(reply.send).mock.calls[0][0] as {
      data: {
        economics: {
          mrr: number;
          activeSubs: number;
          arpa: number;
          churnRatePct: number;
          ltv: number | null;
        };
        forecast: { pendingDue30d: number; expectedValue: number; confidencePct: number | null };
      };
    };
    // MRR = 120 + 1200/12 = 220; ARPA = 110; churn = 1/2 = 50%; LTV = 110/0.5 = 220
    expect(sent.data.economics).toMatchObject({
      mrr: 220,
      activeSubs: 2,
      arpa: 110,
      churnRatePct: 50,
      ltv: 220,
    });
    // 9 pagas / (9 pagas + 1 pendente) = 90%; 1000 × 0.9 = 900
    expect(sent.data.forecast).toMatchObject({
      pendingDue30d: 1000,
      expectedValue: 900,
      confidencePct: 90,
    });
  });

  it("retorna LTV nulo quando não há churn", async () => {
    const now = new Date();
    prismaMock.invoice.aggregate.mockImplementation(agingAggregateImpl(now));
    prismaMock.subscription.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ plan: { price: 99, billingCycle: "MONTHLY" } }]);
    prismaMock.invoice.groupBy.mockResolvedValue([]);
    prismaMock.subscription.count.mockResolvedValue(0);

    const reply = makeReply();
    await controller.insights(makeRequest(), reply as never);

    const sent = vi.mocked(reply.send).mock.calls[0][0] as {
      data: {
        economics: { ltv: number | null; churnRatePct: number };
        forecast: { confidencePct: number | null; expectedValue: number };
      };
    };
    expect(sent.data.economics.ltv).toBeNull();
    expect(sent.data.economics.churnRatePct).toBe(0);
    expect(sent.data.forecast.confidencePct).toBeNull();
    expect(sent.data.forecast.expectedValue).toBe(0);
  });

  it("monta coortes dos últimos 6 meses com taxa de retenção", async () => {
    const now = new Date();
    const prevMonth = new Date(spMonthStartOffset(now, -1).getTime() + 3600_000);
    const oldestMonth = new Date(spMonthStartOffset(now, -5).getTime() + 3600_000);
    prismaMock.invoice.aggregate.mockImplementation(agingAggregateImpl(now));
    prismaMock.subscription.findMany
      .mockResolvedValueOnce([
        { createdAt: prevMonth, status: "ACTIVE" },
        { createdAt: prevMonth, status: "CANCELED" },
        { createdAt: oldestMonth, status: "CANCELED" },
      ])
      .mockResolvedValueOnce([]);
    prismaMock.invoice.groupBy.mockResolvedValue([]);
    prismaMock.subscription.count.mockResolvedValue(0);

    const reply = makeReply();
    await controller.insights(makeRequest(), reply as never);

    const sent = vi.mocked(reply.send).mock.calls[0][0] as {
      data: {
        cohorts: Array<{ month: string; subscriptions: number; retained: number; retainedPct: number }>;
      };
    };
    expect(sent.data.cohorts).toHaveLength(6);
    const prev = sent.data.cohorts[4];
    expect(prev.month).toBe(prevMonth.toISOString().slice(0, 7));
    expect(prev).toMatchObject({ subscriptions: 2, retained: 1, retainedPct: 50 });
    expect(sent.data.cohorts[0]).toMatchObject({ subscriptions: 1, retained: 0, retainedPct: 0 });
    expect(sent.data.cohorts[2]).toMatchObject({ subscriptions: 0, retainedPct: 0 });
  });
});

describe("AdminBillingInsightsController.statement", () => {
  beforeEach(() => vi.clearAllMocks());

  it("emite CSV em streaming com cabeçalho, escaping e filtros", async () => {
    prismaMock.invoice.findMany.mockResolvedValue([
      {
        id: "inv-1",
        createdAt: new Date("2026-10-01T12:00:00.000Z"),
        dueDate: new Date("2026-10-05T12:00:00.000Z"),
        paidAt: new Date("2026-10-03T12:00:00.000Z"),
        status: "PAID",
        amount: 199.9,
        plan: { name: "Pro, anual" },
        subscription: { barbershop: { name: 'Salão "Central"' } },
      },
      {
        id: "inv-2",
        createdAt: new Date("2026-10-02T12:00:00.000Z"),
        dueDate: new Date("2026-10-06T12:00:00.000Z"),
        paidAt: null,
        status: "PENDING",
        amount: 99,
        plan: null,
        subscription: { barbershop: { name: "Studio Norte" } },
      },
    ]);

    const reply = makeReply();
    await controller.statement(
      makeRequest({ status: "PAID", from: new Date("2026-10-01") }),
      reply as never,
    );

    expect(reply.header).toHaveBeenCalledWith("Content-Type", "text/csv; charset=utf-8");

    // Readable.from é preguiçoso: o Prisma só é consultado ao consumir o stream.
    const stream = vi.mocked(reply.send).mock.calls[0][0] as Readable;
    const chunks: string[] = [];
    for await (const chunk of stream) chunks.push(String(chunk));
    const text = chunks.join("");

    expect(prismaMock.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: "PAID", createdAt: { gte: new Date("2026-10-01") } },
        take: 500,
      }),
    );

    expect(text).toMatch(/^id,createdAt,dueDate,paidAt,status,amount,plan,barbershop\r\n/);
    expect(text).toContain('"Pro, anual"');
    expect(text).toContain('"Salão ""Central"""');
    expect(text).toContain(
      "inv-2,2026-10-02T12:00:00.000Z,2026-10-06T12:00:00.000Z,,PENDING,99,,Studio Norte",
    );
  });

  it("gera o extrato completo quando não há filtros", async () => {
    prismaMock.invoice.findMany.mockResolvedValue([]);

    const reply = makeReply();
    await controller.statement(makeRequest(), reply as never);

    const stream = vi.mocked(reply.send).mock.calls[0][0] as Readable;
    const chunks: string[] = [];
    for await (const chunk of stream) chunks.push(String(chunk));
    expect(chunks.join("")).toMatch(/^id,createdAt,/);
    expect(prismaMock.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });
});
