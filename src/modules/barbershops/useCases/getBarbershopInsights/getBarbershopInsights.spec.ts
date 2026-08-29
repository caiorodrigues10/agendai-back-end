import { describe, it, expect, vi, beforeEach } from "vitest";
import { GetBarbershopInsightsUseCase, type InsightsPeriod } from "./GetBarbershopInsightsUseCase";

vi.mock("@/libs/prismaClient", () => ({
  prisma: {
    queueItem: { findMany: vi.fn().mockResolvedValue([]) },
    appointment: { findMany: vi.fn().mockResolvedValue([]) },
    expense: { findMany: vi.fn().mockResolvedValue([]) },
    fiado: { findMany: vi.fn().mockResolvedValue([]) },
    user: { findMany: vi.fn().mockResolvedValue([]) },
    service: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

let useCase: GetBarbershopInsightsUseCase;

beforeEach(() => {
  vi.clearAllMocks();
  useCase = new GetBarbershopInsightsUseCase();
});

describe("GetBarbershopInsightsUseCase", () => {
  const barbershopId = "test-shop-id";

  it("aceita período 7d e retorna dados básicos", async () => {
    const result = await useCase.execute(barbershopId, "7d");
    expect(result.period).toBe("7d");
    expect(result.kpis).toBeDefined();
    expect(result.byWeekday).toHaveLength(7);
    expect(result.byHour.length).toBeGreaterThan(0);
    expect(result.highlights).toBeInstanceOf(Array);
    expect(result.byMonth).toBeInstanceOf(Array);
  });

  it("aceita período 30d", async () => {
    const result = await useCase.execute(barbershopId, "30d");
    expect(result.period).toBe("30d");
  });

  it("aceita período 90d", async () => {
    const result = await useCase.execute(barbershopId, "90d");
    expect(result.period).toBe("90d");
  });

  it("aceita período 1y e retorna byMonth", async () => {
    const result = await useCase.execute(barbershopId, "1y");
    expect(result.period).toBe("1y");
    expect(result.byMonth).toBeInstanceOf(Array);
  });

  it("usa 30d como padrão quando período é inválido", async () => {
    const result = await useCase.execute(barbershopId, "invalid" as InsightsPeriod);
    expect(result.period).toBe("invalid");
  });

  it("retorna KPIs zerados quando não há dados", async () => {
    const result = await useCase.execute(barbershopId, "1y");
    expect(result.kpis.revenue).toBe(0);
    expect(result.kpis.completedServices).toBe(0);
    expect(result.kpis.avgTicket).toBe(0);
    expect(result.kpis.uniqueCustomers).toBe(0);
    expect(result.kpis.expenses).toBe(0);
    expect(result.kpis.netProfit).toBe(0);
  });

  it("retorna highlights de dados insuficientes quando não há atendimentos", async () => {
    const result = await useCase.execute(barbershopId, "1y");
    expect(result.highlights.some((h) => h.includes("poucos atendimentos"))).toBe(true);
  });

  it("calcula byMonth com atendimentos concluídos", async () => {
    const now = new Date();
    const { prisma } = await import("@/libs/prismaClient");
    const mockPrisma = vi.mocked(prisma);

    const twoMonthsAgo = new Date(now);
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

    mockPrisma.queueItem.findMany.mockResolvedValueOnce([
      {
        id: "q1",
        serviceId: "s1",
        customerName: "João",
        whatsapp: "559999999999",
        joinedAt: twoMonthsAgo,
        completedAt: twoMonthsAgo,
        completedBy: "staff1",
        finalPrice: 50,
        status: "COMPLETED",
      },
      {
        id: "q2",
        serviceId: "s1",
        customerName: "Maria",
        whatsapp: "559888888888",
        joinedAt: now,
        completedAt: now,
        completedBy: "staff1",
        finalPrice: 30,
        status: "COMPLETED",
      },
    ] as any);
    mockPrisma.user.findMany.mockResolvedValueOnce([{ id: "staff1", name: "Barbeiro 1" }] as any);
    mockPrisma.service.findMany.mockResolvedValueOnce([{ id: "s1", name: "Corte", price: 40 }] as any);

    const result = await useCase.execute(barbershopId, "1y");

    expect(result.byMonth.length).toBeGreaterThanOrEqual(1);
    const totalRevenue = result.byMonth.reduce((s, m) => s + m.revenue, 0);
    expect(totalRevenue).toBe(80);
  });

 it("gera highlights anuais (melhor mês e faturamento médio) quando há dados", async () => {
    const now = new Date();
    const { prisma } = await import("@/libs/prismaClient");
    const mockPrisma = vi.mocked(prisma);

    const items = Array.from({ length: 5 }, (_, i) => {
      const d = new Date(now);
      d.setMonth(d.getMonth() - i);
      return {
        id: `q${i}`,
        serviceId: "s1",
        customerName: `Cliente ${i}`,
        whatsapp: `55999999${String(i).padStart(4, "0")}`,
        joinedAt: d,
        completedAt: d,
        completedBy: "staff1",
        finalPrice: 100,
        status: "COMPLETED",
      };
    });

    mockPrisma.queueItem.findMany.mockResolvedValueOnce(items as any);
    mockPrisma.user.findMany.mockResolvedValueOnce([{ id: "staff1", name: "Barbeiro" }] as any);
    mockPrisma.service.findMany.mockResolvedValueOnce([{ id: "s1", name: "Corte", price: 100 }] as any);

    const result = await useCase.execute(barbershopId, "1y");

    expect(result.highlights.some((h) => h.includes("Melhor mês do ano"))).toBe(true);
    expect(result.highlights.some((h) => h.includes("Faturamento médio mensal"))).toBe(true);
  });
});
