/// <reference types="vitest/globals" />
import type {
  ITrafficReportRepository,
  TrafficDailyRow,
  UserSignupDayRow,
} from "../ports/ITrafficReportRepository";
import { GetTrafficReportUseCase } from "./GetTrafficReportUseCase";

function repositoryMock(): ITrafficReportRepository {
  return {
    findDaily: vi.fn().mockResolvedValue([]),
    findHourly: vi.fn().mockResolvedValue([]),
    findOrigins: vi.fn().mockResolvedValue([]),
    countDistinctActiveUsers: vi.fn().mockResolvedValue(0),
    getFirstActivityDay: vi.fn().mockResolvedValue(null),
    getFirstTrafficDay: vi.fn().mockResolvedValue(null),
    countNewShopsByDay: vi.fn().mockResolvedValue([]),
    countNewUsersByDay: vi.fn().mockResolvedValue([]),
    sumLostUpdates: vi.fn().mockResolvedValue(0),
  };
}

describe("GetTrafficReportUseCase", () => {
  it("usa usuários distintos reais e expõe a primeira data de atividade", async () => {
    const repo = repositoryMock();
    vi.mocked(repo.getFirstActivityDay).mockResolvedValue("2026-04-01");
    vi.mocked(repo.getFirstTrafficDay).mockResolvedValue("2026-05-01");
    vi.mocked(repo.countDistinctActiveUsers).mockResolvedValue(2);
    const daily: TrafficDailyRow[] = [
      {
        day: "2026-11-15",
        area: "public_site",
        visits: 10,
        visitors: 7,
        sessions: 6,
        lostUpdates: 0,
      },
    ];
    vi.mocked(repo.findDaily).mockResolvedValue(daily);

    const useCase = new GetTrafficReportUseCase(repo);
    const payload = await useCase.execute(
      { period: "day", area: "all" },
      new Date("2026-11-15T12:00:00.000Z"),
    );

    expect(payload.totals.loggedInUsers).toBe(2);
    expect(repo.countDistinctActiveUsers).toHaveBeenCalledWith("2026-11-15", "2026-11-15");
    expect(payload.userActivity.firstRecordedAt).toBe("2026-04-01");
    expect(payload.period.dataFrom).toBe("2026-05-01");
    expect(payload.totals.visitors).toBe(7);
    expect(payload.totals.visitorsBasis).toBe("daily_distinct");
  });

  it("consolida novos usuários e removidos no total e na série", async () => {
    const repo = repositoryMock();
    const signups: UserSignupDayRow[] = [
      { day: "2026-11-15", total: 4, removed: 1 },
      { day: "2026-11-16", total: 2, removed: 2 },
    ];
    vi.mocked(repo.countNewUsersByDay).mockResolvedValue(signups);

    const useCase = new GetTrafficReportUseCase(repo);
    const payload = await useCase.execute(
      { period: "week", area: "all" },
      new Date("2026-11-16T12:00:00.000Z"),
    );

    expect(payload.totals.newUsers).toBe(6);
    expect(payload.totals.newUsersRemoved).toBe(3);
    expect(payload.series.reduce((sum, point) => sum + point.newUsers, 0)).toBe(6);
    expect(payload.series.reduce((sum, point) => sum + point.newUsersRemoved, 0)).toBe(3);
  });

  it("não soma usuários ativos como dias distintos", async () => {
    const repo = repositoryMock();
    vi.mocked(repo.countDistinctActiveUsers).mockResolvedValue(1);

    const useCase = new GetTrafficReportUseCase(repo);
    const payload = await useCase.execute(
      { period: "week", area: "all" },
      new Date("2026-11-16T12:00:00.000Z"),
    );

    expect(payload.totals.loggedInUsers).toBe(1);
  });
});
