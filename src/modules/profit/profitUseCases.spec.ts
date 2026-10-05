/// <reference types="vitest/globals" />
import { AppError } from "@/shared/errors/AppError";

const mockRepo = {
  getSettings: vi.fn().mockResolvedValue(null),
  upsertSettings: vi.fn().mockResolvedValue({}),
  getEntriesByPeriod: vi.fn().mockResolvedValue([]),
  upsertEntry: vi.fn().mockResolvedValue({}),
  getTrend: vi.fn().mockResolvedValue([
    { period: new Date("2026-07-01"), revenue: 5000, netProfit: 1500, marginPercent: 30 },
    { period: new Date("2026-08-01"), revenue: null, netProfit: null, marginPercent: 0 },
  ]),
  getByService: vi.fn().mockResolvedValue([]),
  getByStaff: vi.fn().mockResolvedValue([]),
  deleteEntriesForPeriod: vi.fn().mockResolvedValue({}),
  getCompletedAppointments: vi.fn().mockResolvedValue([]),
  getQueueCompletions: vi.fn().mockResolvedValue([]),
  getExpenses: vi.fn().mockResolvedValue([]),
  getCommissions: vi.fn().mockResolvedValue([]),
};

vi.mock("./profitRepository", () => {
  return {
    ProfitRepository: class {
      getSettings = mockRepo.getSettings;
      upsertSettings = mockRepo.upsertSettings;
      getEntriesByPeriod = mockRepo.getEntriesByPeriod;
      upsertEntry = mockRepo.upsertEntry;
      getTrend = mockRepo.getTrend;
      getByService = mockRepo.getByService;
      getByStaff = mockRepo.getByStaff;
      deleteEntriesForPeriod = mockRepo.deleteEntriesForPeriod;
      getCompletedAppointments = mockRepo.getCompletedAppointments;
      getQueueCompletions = mockRepo.getQueueCompletions;
      getExpenses = mockRepo.getExpenses;
      getCommissions = mockRepo.getCommissions;
    },
  };
});

vi.mock("@/modules/products/utils/retailSummary", () => ({
  summarizeRetailFinancials: vi.fn().mockResolvedValue({
    revenue: 200,
    refunded: 0,
    netRevenue: 200,
    cogs: 120,
    margin: 80,
    saleCount: 3,
  }),
  summarizeRetailLines: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock("@/modules/financial/ledger/shopTime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/financial/ledger/shopTime")>();
  return {
    ...actual,
    getShopTimezone: vi.fn().mockResolvedValue("America/Sao_Paulo"),
  };
});

import { summarizeRetailFinancials } from "@/modules/products/utils/retailSummary";
import { ProfitUseCases } from "./profitUseCases";

describe("ProfitUseCases", () => {
  let useCases: ProfitUseCases;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRepo.getTrend.mockResolvedValue([
      { period: new Date("2026-07-01"), revenue: 5000, netProfit: 1500, marginPercent: 30 },
      { period: new Date("2026-08-01"), revenue: null, netProfit: null, marginPercent: 0 },
    ]);
    mockRepo.getEntriesByPeriod.mockResolvedValue([]);
    useCases = new ProfitUseCases();
  });

  describe("getTrend", () => {
    it("normalizes null/undefined revenue and netProfit to 0 (no NaN in response)", async () => {
      const result = await useCases.getTrend("shop-1", 6);
      expect(result).toHaveLength(2);
      expect(result[0].revenue).toBe(5000);
      expect(result[0].netProfit).toBe(1500);
      expect(result[1].revenue).toBe(0);
      expect(result[1].netProfit).toBe(0);
      expect(Number.isNaN(result[1].revenue)).toBe(false);
      expect(Number.isNaN(result[1].netProfit)).toBe(false);
    });

    it("normalizes NaN marginPercent to 0", async () => {
      const result = await useCases.getTrend("shop-1", 6);
      expect(typeof result[1].marginPercent).toBe("number");
      expect(Number.isNaN(result[1].marginPercent)).toBe(false);
    });
  });

  describe("computePeriod", () => {
    const period = new Date(2026, 8, 1);

    beforeEach(() => {
      mockRepo.deleteEntriesForPeriod.mockResolvedValue({});
      mockRepo.upsertEntry.mockImplementation(
        (_bs: string, _p: Date, serviceId: string | null, staffId: string | null, data: Record<string, unknown>) =>
          Promise.resolve({ serviceId, staffId, ...data })
      );
      mockRepo.getSettings.mockResolvedValue({
        defaultTaxRate: 10,
        defaultCommission: 0,
        overheadCategories: { "cat-overhead": 1 },
      });
      mockRepo.getCompletedAppointments.mockResolvedValue([
        {
          id: "a1",
          serviceId: "s1",
          staffId: "p1",
          finalPrice: 100,
          clientPackageId: null,
          service: { id: "s1", name: "Corte", price: 80, commissionPercent: 30 },
          staff: { id: "p1", name: "João" },
        },
        {
          id: "a2",
          serviceId: "s1",
          staffId: "p1",
          finalPrice: 60,
          clientPackageId: "pkg1",
          service: { id: "s1", name: "Corte", price: 80, commissionPercent: 30 },
          staff: { id: "p1", name: "João" },
        },
      ]);
      mockRepo.getQueueCompletions.mockResolvedValue([
        {
          id: "q1",
          serviceId: "s2",
          completedBy: "p1",
          finalPrice: 50,
          service: { id: "s2", name: "Barba", price: 40 },
        },
      ]);
      mockRepo.getCommissions.mockResolvedValue([
        { id: "c1", serviceId: "s1", professionalId: "p1", percentage: 30, amount: 30 },
        { id: "c2", serviceId: "s2", professionalId: "p1", percentage: 20, amount: 10 },
      ]);
      mockRepo.getExpenses.mockResolvedValue([
        { id: "e1", amount: 40, type: "FIXED", categoryId: "cat-overhead", inventoryReceiptId: null },
        { id: "e2", amount: 20, type: "VARIABLE", categoryId: "cat-other", inventoryReceiptId: null },
        { id: "e3", amount: 999, type: "STOCK", categoryId: "cat-stock", inventoryReceiptId: "r1" },
      ]);
      vi.mocked(summarizeRetailFinancials).mockResolvedValue({
        revenue: 200,
        refunded: 0,
        netRevenue: 200,
        cogs: 120,
        margin: 80,
        saleCount: 3,
      });
    });

    const totalsOf = () => {
      const call = mockRepo.upsertEntry.mock.calls.find(
        (c: unknown[]) => c[2] === null && c[3] === null
      );
      expect(call).toBeTruthy();
      return call![4] as {
        revenue: number;
        directCosts: number;
        overheadCosts: number;
        operationalCosts: number;
        taxAmount: number;
        commissionAmt: number;
        netProfit: number;
        marginPercent: number;
      };
    };

    it("usa finalPrice (nao service.price), ignora sessao de pacote e soma a fila", async () => {
      const result = await useCases.computePeriod("shop-1", "2026-09");

      expect(result.summary.serviceRevenue).toBe(150);
      expect(result.summary.productRevenue).toBe(200);
      expect(result.summary.totalRevenue).toBe(350);
      expect(result.summary.totalAppointments).toBe(3);
      expect(totalsOf().revenue).toBe(350);
    });

    it("calcula CMV, overhead por categoria, custos operacionais e lucro", async () => {
      const result = await useCases.computePeriod("shop-1", "2026-09");

      const totals = totalsOf();
      expect(totals.directCosts).toBe(120);
      expect(totals.overheadCosts).toBe(40);
      expect(totals.operationalCosts).toBe(20);
      expect(totals.taxAmount).toBe(35);
      expect(totals.commissionAmt).toBe(40);
      expect(totals.netProfit).toBe(95);
      expect(totals.marginPercent).toBeCloseTo((95 / 350) * 100, 5);
      expect(result.summary.netProfit).toBe(95);
    });

    it("quando overheadCategories esta vazio, despesas operacionais viram indiretas", async () => {
      mockRepo.getSettings.mockResolvedValue({
        defaultTaxRate: 0,
        defaultCommission: 0,
        overheadCategories: {},
      });

      await useCases.computePeriod("shop-1", "2026-09");

      const totals = totalsOf();
      expect(totals.overheadCosts).toBe(60);
      expect(totals.operationalCosts).toBe(0);
    });

    it("recalcula por servico e por profissional com comissao real", async () => {
      const result = await useCases.computePeriod("shop-1", "2026-09");

      const byService = result.byService as unknown as { serviceId: string; revenue: number }[];
      expect(byService.find((e) => e.serviceId === "s1")?.revenue).toBe(100);
      expect(byService.find((e) => e.serviceId === "s2")?.revenue).toBe(50);

      const byStaff = result.byStaff as unknown as {
        staffId: string;
        revenue: number;
        commissionAmt: number;
      }[];
      expect(byStaff[0].revenue).toBe(150);
      expect(byStaff[0].commissionAmt).toBe(40);
    });

    it("consulta o periodo no fuso do salao e limpa o periodo anterior", async () => {
      await useCases.computePeriod("shop-1", "2026-09");

      expect(mockRepo.deleteEntriesForPeriod).toHaveBeenCalledWith("shop-1", period);
      const range = mockRepo.getCompletedAppointments.mock.calls[0][1] as {
        start: Date;
        end: Date;
      };
      expect(range.start.toISOString()).toBe("2026-09-01T03:00:00.000Z");
      expect(range.end.toISOString()).toBe("2026-10-01T02:59:59.999Z");
    });
  });

  describe("parsePeriod (via getPeriodProfit)", () => {
    it("accepts valid YYYY-MM period", async () => {
      const result = await useCases.getPeriodProfit("shop-1", "2026-09");
      expect(result.period).toBe("2026-09");
    });

    it("rejects invalid period format", async () => {
      await expect(useCases.getPeriodProfit("shop-1", "invalid")).rejects.toThrow(AppError);
      await expect(useCases.getPeriodProfit("shop-1", "invalid")).rejects.toMatchObject({ statusCode: 400 });
    });

    it("rejects invalid month (13)", async () => {
      await expect(useCases.getPeriodProfit("shop-1", "2026-13")).rejects.toThrow(AppError);
      await expect(useCases.getPeriodProfit("shop-1", "2026-13")).rejects.toMatchObject({ statusCode: 400 });
    });

    it("rejects month 0", async () => {
      await expect(useCases.getPeriodProfit("shop-1", "2026-00")).rejects.toThrow(AppError);
    });
  });
});
