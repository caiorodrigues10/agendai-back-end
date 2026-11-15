import { injectable } from "tsyringe";
import { prisma, Prisma } from "@/libs/prismaClient";
import type { TrafficArea } from "../domain/trafficAreas";
import { civilDayStartInstant, civilDayToDate } from "../domain/periodWindows";
import type {
  ITrafficReportRepository,
  SignupDayRow,
  TrafficDailyRow,
  TrafficHourlyRow,
  TrafficOriginRow,
  UserSignupDayRow,
} from "../application/ports/ITrafficReportRepository";

/**
 * Prisma adapter for the traffic report reads.
 *
 * Civil days are stored as `@db.Date`; Prisma maps them to a UTC-midnight
 * Date, so `civilDayToDate` is the single conversion point (round-trip
 * `YYYY-MM-DDT00:00:00.000Z`). Signup counts bucket `createdAt` (UTC) into
 * America/Sao_Paulo civil days in SQL, matching `getAdminOverview.ts`.
 */
@injectable()
export class PrismaTrafficReportRepository implements ITrafficReportRepository {
  async findDaily(
    fromDay: string,
    toDay: string,
    area?: TrafficArea,
  ): Promise<TrafficDailyRow[]> {
    const rows = await prisma.siteTrafficDaily.findMany({
      where: {
        day: { gte: civilDayToDate(fromDay), lte: civilDayToDate(toDay) },
        ...(area ? { area } : {}),
      },
      orderBy: { day: "asc" },
    });
    return rows.map((row) => ({
      day: row.day.toISOString().slice(0, 10),
      area: row.area as TrafficArea,
      visits: row.visits,
      visitors: row.visitors,
      sessions: row.sessions,
      lostUpdates: row.lostUpdates,
    }));
  }

  async findHourly(dayKeys: string[], area?: TrafficArea): Promise<TrafficHourlyRow[]> {
    if (dayKeys.length === 0) return [];
    const rows = await prisma.siteTrafficHourly.findMany({
      where: {
        day: { in: dayKeys.map(civilDayToDate) },
        ...(area ? { area } : {}),
      },
      orderBy: [{ day: "asc" }, { hour: "asc" }],
    });
    return rows.map((row) => ({
      day: row.day.toISOString().slice(0, 10),
      hour: row.hour,
      area: row.area as TrafficArea,
      visits: row.visits,
      visitors: row.visitors,
    }));
  }

  async findOrigins(fromDay: string, toDay: string, limit: number): Promise<TrafficOriginRow[]> {
    const grouped = await prisma.siteTrafficOriginDaily.groupBy({
      by: ["origin"],
      where: {
        day: { gte: civilDayToDate(fromDay), lte: civilDayToDate(toDay) },
      },
      _sum: { visits: true },
      orderBy: { _sum: { visits: "desc" } },
      take: limit,
    });
    return grouped.map((row) => ({
      origin: row.origin,
      visits: row._sum.visits ?? 0,
    }));
  }

  async countDistinctActiveUsers(fromDay: string, toDay: string): Promise<number> {
    const grouped = await prisma.userActivityDaily.groupBy({
      by: ["userId"],
      where: {
        day: { gte: civilDayToDate(fromDay), lte: civilDayToDate(toDay) },
      },
    });
    return grouped.length;
  }

  async getFirstActivityDay(): Promise<string | null> {
    const row = await prisma.userActivityDaily.findFirst({
      orderBy: { day: "asc" },
      select: { day: true },
    });
    return row ? row.day.toISOString().slice(0, 10) : null;
  }

  async getFirstTrafficDay(): Promise<string | null> {
    const row = await prisma.siteTrafficDaily.findFirst({
      where: {
        OR: [
          { visits: { gt: 0 } },
          { visitors: { gt: 0 } },
          { sessions: { gt: 0 } },
        ],
      },
      orderBy: { day: "asc" },
      select: { day: true },
    });
    return row ? row.day.toISOString().slice(0, 10) : null;
  }

  async countNewShopsByDay(fromDay: string, toDay: string): Promise<SignupDayRow[]> {
    const from = civilDayStartInstant(fromDay);
    const to = civilDayStartInstant(toDay);
    const rows = await prisma.$queryRaw<Array<{ day: string; total: number }>>`
      SELECT
        to_char(
          ((b."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo')::date,
          'YYYY-MM-DD'
        ) AS day,
        count(*)::int AS total
      FROM barbershops b
      WHERE b."createdAt" >= (${from}::timestamptz AT TIME ZONE 'UTC')
        AND b."createdAt" < ((${to}::timestamptz AT TIME ZONE 'UTC') + interval '1 day')
      GROUP BY 1
      ORDER BY 1
    `;
    return rows.map((row) => ({ day: row.day, total: Number(row.total) }));
  }

  async countNewUsersByDay(
    fromDay: string,
    toDay: string,
    role?: string,
  ): Promise<UserSignupDayRow[]> {
    const from = civilDayStartInstant(fromDay);
    const to = civilDayStartInstant(toDay);
    const roleClause = role
      ? Prisma.sql`AND u."role" = ${role}::"Role"`
      : Prisma.empty;
    const rows = await prisma.$queryRaw<Array<{ day: string; total: number; removed: number }>>`
      SELECT
        to_char(
          ((u."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo')::date,
          'YYYY-MM-DD'
        ) AS day,
        count(*)::int AS total,
        count(*) FILTER (WHERE u."deletedAt" IS NOT NULL)::int AS removed
      FROM users u
      WHERE u."createdAt" >= (${from}::timestamptz AT TIME ZONE 'UTC')
        AND u."createdAt" < ((${to}::timestamptz AT TIME ZONE 'UTC') + interval '1 day')
        ${roleClause}
      GROUP BY 1
      ORDER BY 1
    `;
    return rows.map((row) => ({
      day: row.day,
      total: Number(row.total),
      removed: Number(row.removed),
    }));
  }

  async sumLostUpdates(fromDay: string, toDay: string): Promise<number> {
    const aggregated = await prisma.siteTrafficDaily.aggregate({
      where: { day: { gte: civilDayToDate(fromDay), lte: civilDayToDate(toDay) } },
      _sum: { lostUpdates: true },
    });
    return aggregated._sum.lostUpdates ?? 0;
  }
}
