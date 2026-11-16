/// <reference types="vitest/globals" />
import type { TrafficReportPayload } from "../application/useCases/GetTrafficReportUseCase";
import { buildTrafficCsv, toTrafficReportQuery } from "./TrafficReportController";

describe("TrafficReportController", () => {
  it("normaliza date e month em uma única âncora civil interna", () => {
    expect(
      toTrafficReportQuery({
        period: "day",
        area: "all",
        date: "2026-11-10",
      }),
    ).toMatchObject({
      period: "day",
      area: "all",
      referenceDay: "2026-11-10",
    });

    expect(
      toTrafficReportQuery({
        period: "month",
        area: "all",
        month: "2026-10",
      }),
    ).toMatchObject({
      period: "month",
      area: "all",
      referenceDay: "2026-10-01",
    });

    expect(
      toTrafficReportQuery({
        period: "week",
        area: "all",
      }),
    ).toMatchObject({
      period: "week",
      area: "all",
      referenceDay: undefined,
    });
  });

  it("mantém no CSV a série do período ancorado", () => {
    const payload: TrafficReportPayload = {
      period: {
        key: "day",
        label: "Dia",
        granularity: "hour",
        fromDay: "2026-11-10",
        toDay: "2026-11-10",
        prevFromDay: "2026-11-09",
        prevToDay: "2026-11-09",
        timezone: "America/Sao_Paulo",
        dataFrom: null,
      },
      generatedAt: "2026-11-15T12:00:00.000Z",
      beaconEnabled: true,
      totals: {
        visits: 4,
        visitors: 3,
        visitorsBasis: "daily_distinct",
        sessions: 2,
        loggedInUsers: 1,
        newShops: 0,
        newUsers: 0,
        newUsersRemoved: 0,
      },
      prevTotals: null,
      deltaPct: null,
      series: [
        {
          bucketStart: "2026-11-10T09",
          label: "09:00",
          visits: 4,
          visitors: 3,
          sessions: null,
          newShops: 0,
          newUsers: 0,
          newUsersRemoved: 0,
          partial: false,
        },
      ],
      areas: [],
      origins: [],
      loss: {
        counterRegressions: 0,
        redisUnavailableDrops: 0,
        notes: [],
      },
      userActivity: {
        firstRecordedAt: null,
      },
    };

    const csv = buildTrafficCsv(payload);

    expect(csv).toContain(
      "2026-11-10T09,09:00,4,3,,0,0,0,nao\r\n",
    );
  });
});
