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
      {
        day: "2026-11-15",
        area: "all",
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
    expect(payload.period).toMatchObject({
      fromDay: "2026-11-15",
      toDay: "2026-11-15",
      prevFromDay: "2026-11-14",
      prevToDay: "2026-11-14",
    });
    expect(payload.series.filter((point) => point.partial)).toEqual([
      expect.objectContaining({ bucketStart: "2026-11-15T09" }),
    ]);
  });

  it("usa o dia selecionado nos buckets, totais e comparação", async () => {
    const repo = repositoryMock();
    vi.mocked(repo.findDaily).mockImplementation(async (from, _to, area) => {
      if (area !== "all") return [];
      if (from === "2026-11-10") {
        return [
          {
            day: "2026-11-10",
            area: "all",
            visits: 10,
            visitors: 7,
            sessions: 6,
            lostUpdates: 0,
          },
        ];
      }
      if (from === "2026-11-09") {
        return [
          {
            day: "2026-11-09",
            area: "all",
            visits: 5,
            visitors: 4,
            sessions: 3,
            lostUpdates: 0,
          },
        ];
      }
      return [];
    });
    vi.mocked(repo.findHourly).mockImplementation(async (_days, area) =>
      area === "all"
        ? [
            {
              day: "2026-11-10",
              hour: 9,
              area: "all",
              visits: 4,
              visitors: 3,
            },
          ]
        : [],
    );

    const useCase = new GetTrafficReportUseCase(repo);
    const payload = await useCase.execute(
      { period: "day", area: "all", referenceDay: "2026-11-10" },
      new Date("2026-11-15T12:00:00.000Z"),
    );

    expect(payload.period).toMatchObject({
      granularity: "hour",
      fromDay: "2026-11-10",
      toDay: "2026-11-10",
      prevFromDay: "2026-11-09",
      prevToDay: "2026-11-09",
    });
    expect(payload.series).toHaveLength(24);
    expect(payload.series.every((point) => point.partial === false)).toBe(true);
    expect(payload.series.find((point) => point.bucketStart === "2026-11-10T09"))
      .toMatchObject({ visits: 4, visitors: 3 });
    expect(payload.totals).toMatchObject({ visits: 10, visitors: 7, sessions: 6 });
    expect(payload.prevTotals).toMatchObject({ visits: 5, visitors: 4, sessions: 3 });
    expect(payload.deltaPct).toMatchObject({ visits: 100, visitors: 75, sessions: 100 });
    expect(repo.findDaily).toHaveBeenCalledWith("2026-11-10", "2026-11-10", "all");
    expect(repo.findDaily).toHaveBeenCalledWith("2026-11-09", "2026-11-09", "all");
    expect(repo.findHourly).toHaveBeenCalledWith(["2026-11-10"], "all");
  });

  it("usa o mês histórico selecionado e o mês anterior completo", async () => {
    const repo = repositoryMock();
    vi.mocked(repo.findDaily).mockImplementation(async (from, _to, area) => {
      if (area !== "all") return [];
      if (from === "2026-10-01") {
        return [
          {
            day: "2026-10-15",
            area: "all",
            visits: 20,
            visitors: 10,
            sessions: 8,
            lostUpdates: 0,
          },
        ];
      }
      if (from === "2026-09-01") {
        return [
          {
            day: "2026-09-15",
            area: "all",
            visits: 10,
            visitors: 8,
            sessions: 6,
            lostUpdates: 0,
          },
        ];
      }
      return [];
    });

    const useCase = new GetTrafficReportUseCase(repo);
    const payload = await useCase.execute(
      { period: "month", area: "all", referenceDay: "2026-10-01" },
      new Date("2026-11-15T12:00:00.000Z"),
    );

    expect(payload.period).toMatchObject({
      granularity: "day",
      fromDay: "2026-10-01",
      toDay: "2026-10-31",
      prevFromDay: "2026-09-01",
      prevToDay: "2026-09-30",
    });
    expect(payload.series).toHaveLength(31);
    expect(payload.series.every((point) => point.partial === false)).toBe(true);
    expect(payload.series.find((point) => point.bucketStart === "2026-10-15"))
      .toMatchObject({ visits: 20, visitors: 10, sessions: 8 });
    expect(payload.totals).toMatchObject({
      visits: 20,
      visitors: 10,
      sessions: 8,
      visitorsBasis: "sum_of_daily_distinct",
    });
    expect(payload.prevTotals).toMatchObject({
      visits: 10,
      visitors: 8,
      sessions: 6,
      visitorsBasis: "sum_of_daily_distinct",
    });
    expect(payload.deltaPct).toMatchObject({
      visits: 100,
      visitors: 25,
      sessions: 33.33,
    });
    expect(repo.findDaily).toHaveBeenCalledWith("2026-10-01", "2026-10-31", "all");
    expect(repo.findDaily).toHaveBeenCalledWith("2026-09-01", "2026-09-30", "all");
  });

  it("preserva a janela do mês corrente sem âncora", async () => {
    const repo = repositoryMock();
    const useCase = new GetTrafficReportUseCase(repo);
    const payload = await useCase.execute(
      { period: "month", area: "all" },
      new Date("2026-11-15T12:00:00.000Z"),
    );

    expect(payload.period).toMatchObject({
      fromDay: "2026-11-01",
      toDay: "2026-11-15",
      prevFromDay: "2026-10-01",
      prevToDay: "2026-10-15",
    });
    expect(payload.series.filter((point) => point.partial)).toEqual([
      expect.objectContaining({ bucketStart: "2026-11-15" }),
    ]);
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

  it("usa a linha agregada all para totais e mantém o breakdown por área", async () => {
    const repo = repositoryMock();
    const localRows: TrafficDailyRow[] = [
      {
        day: "2026-11-15",
        area: "public_site",
        visits: 2,
        visitors: 2,
        sessions: 2,
        lostUpdates: 0,
      },
      {
        day: "2026-11-15",
        area: "salon_public",
        visits: 1,
        visitors: 1,
        sessions: 1,
        lostUpdates: 0,
      },
    ];
    const aggregateRows: TrafficDailyRow[] = [
      {
        day: "2026-11-15",
        area: "all",
        visits: 3,
        visitors: 1,
        sessions: 1,
        lostUpdates: 0,
      },
    ];
    vi.mocked(repo.findDaily).mockImplementation(async (_from, _to, area) =>
      area === "all" ? aggregateRows : localRows,
    );

    const useCase = new GetTrafficReportUseCase(repo);
    const payload = await useCase.execute(
      { period: "day", area: "all" },
      new Date("2026-11-15T12:00:00.000Z"),
    );

    expect(payload.totals).toMatchObject({
      visits: 3,
      visitors: 1,
      sessions: 1,
    });
    expect(payload.areas).toEqual([
      {
        area: "public_site",
        label: "Site público/landing",
        visits: 2,
        visitors: 2,
        sessions: 2,
      },
      {
        area: "salon_public",
        label: "Páginas públicas de salão",
        visits: 1,
        visitors: 1,
        sessions: 1,
      },
    ]);
    expect(repo.findDaily).toHaveBeenCalledWith("2026-11-15", "2026-11-15", "all");
    expect(repo.sumLostUpdates).toHaveBeenCalledWith(
      "2026-11-15",
      "2026-11-15",
      "all",
    );
  });

  it("propaga o filtro de papel para o período anterior", async () => {
    const repo = repositoryMock();
    vi.mocked(repo.countNewUsersByDay).mockResolvedValue([]);

    const useCase = new GetTrafficReportUseCase(repo);
    await useCase.execute(
      { period: "day", area: "all", userRole: "OWNER" },
      new Date("2026-11-15T12:00:00.000Z"),
    );

    expect(repo.countNewUsersByDay).toHaveBeenCalledWith(
      "2026-11-15",
      "2026-11-15",
      "OWNER",
    );
    expect(repo.countNewUsersByDay).toHaveBeenCalledWith(
      "2026-11-14",
      "2026-11-14",
      "OWNER",
    );
  });
});
