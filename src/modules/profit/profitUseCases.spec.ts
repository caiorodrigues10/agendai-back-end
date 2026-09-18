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
      getExpenses = mockRepo.getExpenses;
      getCommissions = mockRepo.getCommissions;
    },
  };
});

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
