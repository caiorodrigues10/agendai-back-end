import type { TrafficAggregateArea } from "../../domain/trafficAreas";

/** Daily aggregate row (civil day in America/Sao_Paulo). */
export interface TrafficDailyRow {
  day: string;
  /** Área local ou a linha agregada `all` do site inteiro. */
  area: TrafficAggregateArea;
  visits: number;
  visitors: number;
  sessions: number;
  lostUpdates: number;
}

/** Hourly row inside a civil day. */
export interface TrafficHourlyRow {
  day: string;
  hour: number;
  /** Área local ou a linha agregada `all` do site inteiro. */
  area: TrafficAggregateArea;
  visits: number;
  visitors: number;
}

/** Referrer host aggregate (host only — never a path or query string). */
export interface TrafficOriginRow {
  origin: string;
  visits: number;
}

export interface SignupDayRow {
  day: string;
  total: number;
}

export interface UserSignupDayRow extends SignupDayRow {
  /** Accounts from this day that are (now) soft-deleted. */
  removed: number;
}

/**
 * Application port for report reads. All day ranges are inclusive civil days
 * (YYYY-MM-DD); conversion to UTC instants happens in the infrastructure
 * adapter. The application layer never imports the Prisma runtime.
 */
export interface ITrafficReportRepository {
  findDaily(
    fromDay: string,
    toDay: string,
    area?: TrafficAggregateArea,
  ): Promise<TrafficDailyRow[]>;
  findHourly(
    dayKeys: string[],
    area?: TrafficAggregateArea,
  ): Promise<TrafficHourlyRow[]>;
  findOrigins(fromDay: string, toDay: string, limit: number): Promise<TrafficOriginRow[]>;
  /** Distinct users with recorded activity inside the day range. */
  countDistinctActiveUsers(fromDay: string, toDay: string): Promise<number>;
  /** First civil day with any logged-user activity (null when none). */
  getFirstActivityDay(): Promise<string | null>;
  /** First civil day with any recorded traffic (null when none). */
  getFirstTrafficDay(): Promise<string | null>;
  /** Barbershops created per civil day inside the window (signups). */
  countNewShopsByDay(fromDay: string, toDay: string): Promise<SignupDayRow[]>;
  /** Users created per civil day (incl. soft-deleted), optional role filter. */
  countNewUsersByDay(fromDay: string, toDay: string, role?: string): Promise<UserSignupDayRow[]>;
  /**
   * Sum of persisted counter regressions (site_traffic_daily.lostUpdates).
   * When an area is supplied, only that row is counted — the aggregate `all`
   * row and the three local rows must not be added together.
   */
  sumLostUpdates(
    fromDay: string,
    toDay: string,
    area?: TrafficAggregateArea,
  ): Promise<number>;
}
