import { inject, injectable } from "tsyringe";
import {
  buildPeriodWindow,
  bucketStartForDay,
  bucketStartForHour,
  type BucketGranularity,
  type ReportBucket,
  type TrafficPeriod,
} from "../../domain/periodWindows";
import {
  TRAFFIC_AREA_LABELS,
  TRAFFIC_AREAS,
  type TrafficArea,
} from "../../domain/trafficAreas";
import { getRedisUnavailableDrops } from "../../lossCounters";
import { trafficBeaconEnabled } from "../../trafficConfig";
import type {
  ITrafficReportRepository,
  TrafficDailyRow,
} from "../ports/ITrafficReportRepository";

export const TRAFFIC_REPORT_REPOSITORY = "TrafficReportRepository";

export interface TrafficReportQuery {
  period: TrafficPeriod;
  /** `all` aggregates every area; otherwise a single area filter. */
  area: "all" | TrafficArea;
  /** Optional role filter for "new users" signups. */
  userRole?: string;
}

export interface SeriesPoint {
  bucketStart: string;
  label: string;
  visits: number;
  visitors: number;
  /** null for hour buckets — sessions are deduplicated per civil day. */
  sessions: number | null;
  newShops: number;
  newUsers: number;
  newUsersRemoved: number;
  partial: boolean;
}

export interface TrafficTotals {
  visits: number;
  visitors: number;
  visitorsBasis: "daily_distinct" | "sum_of_daily_distinct";
  sessions: number;
  loggedInUsers: number;
  newShops: number;
  newUsers: number;
  newUsersRemoved: number;
}

export interface TrafficReportPayload {
  period: {
    key: TrafficPeriod;
    label: string;
    granularity: BucketGranularity;
    fromDay: string;
    toDay: string;
    prevFromDay: string | null;
    prevToDay: string | null;
    timezone: "America/Sao_Paulo";
    /** First civil day with recorded traffic — the "data starts at" notice. */
    dataFrom: string | null;
  };
  generatedAt: string;
  beaconEnabled: boolean;
  totals: TrafficTotals;
  prevTotals: TrafficTotals | null;
  deltaPct: {
    visits: number | null;
    visitors: number | null;
    sessions: number | null;
    loggedInUsers: number | null;
    newShops: number | null;
    newUsers: number | null;
  } | null;
  series: SeriesPoint[];
  areas: Array<{
    area: TrafficArea;
    label: string;
    visits: number;
    visitors: number;
    sessions: number;
  }>;
  origins: Array<{ host: string; visits: number }>;
  loss: {
    counterRegressions: number;
    redisUnavailableDrops: number;
    notes: string[];
  };
  userActivity: {
    firstRecordedAt: string | null;
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function pctDelta(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return round2(((current - previous) / previous) * 100);
}

function sumDaily(rows: TrafficDailyRow[]): {
  visits: number;
  visitors: number;
  sessions: number;
} {
  return rows.reduce(
    (acc, row) => ({
      visits: acc.visits + row.visits,
      visitors: acc.visitors + row.visitors,
      sessions: acc.sessions + row.sessions,
    }),
    { visits: 0, visitors: 0, sessions: 0 },
  );
}

const LOSS_NOTES_PT_BR = [
  "A consolidação usa GREATEST(valor_persistido, valor_redis): se o Redis reiniciar e um contador voltar a zero, o valor do banco é preservado e o evento é somado em lostUpdates.",
  "redisUnavailableDrops conta descartes por indisponibilidade do Redis desde o último restart desta instância (perda aceita e monitorada).",
];

const SUM_OF_DAILY_NOTE_PT_BR =
  "Visitantes em períodos de mais de um dia é a soma dos distintos diários: a mesma pessoa em dois dias diferentes conta duas vezes.";

@injectable()
export class GetTrafficReportUseCase {
  constructor(
    @inject(TRAFFIC_REPORT_REPOSITORY)
    private readonly repo: ITrafficReportRepository,
  ) {}

  async execute(query: TrafficReportQuery, now: Date = new Date()): Promise<TrafficReportPayload> {
    const [firstTrafficDay, firstActivityDay] = await Promise.all([
      this.repo.getFirstTrafficDay(),
      this.repo.getFirstActivityDay(),
    ]);

    const window = buildPeriodWindow(query.period, now, { firstRecordedDay: firstTrafficDay });
    const { fromDay, toDay, prevFromDay, prevToDay, buckets, granularity } = window;
    const areaFilter = query.area === "all" ? undefined : query.area;
    const prevRange = prevFromDay && prevToDay ? { fromDay: prevFromDay, toDay: prevToDay } : null;

    const [
      dailyRows,
      hourlyRows,
      signupShops,
      signupUsers,
      loggedInUsers,
      origins,
      lostUpdates,
      prevDailyRows,
      prevSignupShops,
      prevSignupUsers,
      prevLoggedInUsers,
    ] = await Promise.all([
      this.repo.findDaily(fromDay, toDay, areaFilter),
      granularity === "hour" ? this.repo.findHourly([fromDay], areaFilter) : [],
      this.repo.countNewShopsByDay(fromDay, toDay),
      this.repo.countNewUsersByDay(fromDay, toDay, query.userRole),
      this.repo.countDistinctActiveUsers(fromDay, toDay),
      this.repo.findOrigins(fromDay, toDay, 10),
      this.repo.sumLostUpdates(fromDay, toDay),
      prevRange ? this.repo.findDaily(prevRange.fromDay, prevRange.toDay, areaFilter) : [],
      prevRange ? this.repo.countNewShopsByDay(prevRange.fromDay, prevRange.toDay) : [],
      prevRange
        ? this.repo.countNewUsersByDay(prevRange.fromDay, prevRange.toDay, query.userRole)
        : [],
      prevRange ? this.repo.countDistinctActiveUsers(prevRange.fromDay, prevRange.toDay) : 0,
    ]);

    const totals = this.buildTotals({
      dailyRows,
      signupShops,
      signupUsers,
      loggedInUsers,
      singleDay: fromDay === toDay,
    });

    const prevTotals = prevRange
      ? this.buildTotals({
          dailyRows: prevDailyRows,
          signupShops: prevSignupShops,
          signupUsers: prevSignupUsers,
          loggedInUsers: prevLoggedInUsers,
          singleDay: prevRange.fromDay === prevRange.toDay,
        })
      : null;

    const series = this.buildSeries({
      granularity,
      buckets,
      dailyRows,
      hourlyRows,
      signupShops,
      signupUsers,
    });

    const areas = TRAFFIC_AREAS.map((area) => {
      const summed = sumDaily(dailyRows.filter((row) => row.area === area));
      return {
        area,
        label: TRAFFIC_AREA_LABELS[area],
        visits: summed.visits,
        visitors: summed.visitors,
        sessions: summed.sessions,
      };
    }).filter((entry) => entry.visits > 0 || entry.visitors > 0 || entry.sessions > 0);

    const notes = [...LOSS_NOTES_PT_BR];
    if (totals.visitorsBasis === "sum_of_daily_distinct") {
      notes.push(SUM_OF_DAILY_NOTE_PT_BR);
    }

    return {
      period: {
        key: window.key,
        label: window.label,
        granularity,
        fromDay,
        toDay,
        prevFromDay: window.prevFromDay,
        prevToDay: window.prevToDay,
        timezone: "America/Sao_Paulo",
        dataFrom: firstTrafficDay,
      },
      generatedAt: now.toISOString(),
      beaconEnabled: trafficBeaconEnabled(),
      totals,
      prevTotals,
      deltaPct: prevTotals
        ? {
            visits: pctDelta(totals.visits, prevTotals.visits),
            visitors: pctDelta(totals.visitors, prevTotals.visitors),
            sessions: pctDelta(totals.sessions, prevTotals.sessions),
            loggedInUsers: pctDelta(totals.loggedInUsers, prevTotals.loggedInUsers),
            newShops: pctDelta(totals.newShops, prevTotals.newShops),
            newUsers: pctDelta(totals.newUsers, prevTotals.newUsers),
          }
        : null,
      series,
      areas,
      origins: origins.map((row) => ({ host: row.origin, visits: row.visits })),
      loss: {
        counterRegressions: lostUpdates,
        redisUnavailableDrops: getRedisUnavailableDrops(),
        notes,
      },
      userActivity: {
        firstRecordedAt: firstActivityDay,
      },
    };
  }

  private buildTotals(input: {
    dailyRows: TrafficDailyRow[];
    signupShops: Array<{ total: number }>;
    signupUsers: Array<{ total: number; removed: number }>;
    loggedInUsers: number;
    singleDay: boolean;
  }): TrafficTotals {
    const summed = sumDaily(input.dailyRows);
    return {
      visits: summed.visits,
      visitors: summed.visitors,
      visitorsBasis: input.singleDay ? "daily_distinct" : "sum_of_daily_distinct",
      sessions: summed.sessions,
      loggedInUsers: input.loggedInUsers,
      newShops: input.signupShops.reduce((acc, row) => acc + row.total, 0),
      newUsers: input.signupUsers.reduce((acc, row) => acc + row.total, 0),
      newUsersRemoved: input.signupUsers.reduce((acc, row) => acc + row.removed, 0),
    };
  }

  private buildSeries(input: {
    granularity: BucketGranularity;
    buckets: ReportBucket[];
    dailyRows: TrafficDailyRow[];
    hourlyRows: Array<{ day: string; hour: number; visits: number; visitors: number }>;
    signupShops: Array<{ day: string; total: number }>;
    signupUsers: Array<{ day: string; total: number; removed: number }>;
  }): SeriesPoint[] {
    const { granularity, buckets } = input;

    const points: SeriesPoint[] = buckets.map((bucket) => ({
      bucketStart: bucket.start,
      label: bucket.label,
      visits: 0,
      visitors: 0,
      sessions: granularity === "hour" ? null : 0,
      newShops: 0,
      newUsers: 0,
      newUsersRemoved: 0,
      partial: bucket.partial,
    }));

    const indexByStart = new Map(points.map((point, index) => [point.bucketStart, index]));

    if (granularity === "hour") {
      for (const row of input.hourlyRows) {
        const hourKey = `${row.day}T${String(row.hour).padStart(2, "0")}`;
        const bucketStart = bucketStartForHour(hourKey, buckets);
        const index = bucketStart === null ? undefined : indexByStart.get(bucketStart);
        if (index === undefined) continue;
        points[index].visits += row.visits;
        points[index].visitors += row.visitors;
      }
    } else {
      for (const row of input.dailyRows) {
        const bucketStart = bucketStartForDay(row.day, buckets);
        const index = bucketStart === null ? undefined : indexByStart.get(bucketStart);
        if (index === undefined) continue;
        points[index].visits += row.visits;
        points[index].visitors += row.visitors;
        points[index].sessions = (points[index].sessions ?? 0) + row.sessions;
      }
    }

    for (const row of input.signupShops) {
      const bucketStart = bucketStartForDay(row.day, buckets);
      const index = bucketStart === null ? undefined : indexByStart.get(bucketStart);
      if (index !== undefined) points[index].newShops += row.total;
    }
    for (const row of input.signupUsers) {
      const bucketStart = bucketStartForDay(row.day, buckets);
      const index = bucketStart === null ? undefined : indexByStart.get(bucketStart);
      if (index !== undefined) {
        points[index].newUsers += row.total;
        points[index].newUsersRemoved += row.removed;
      }
    }

    return points;
  }
}
