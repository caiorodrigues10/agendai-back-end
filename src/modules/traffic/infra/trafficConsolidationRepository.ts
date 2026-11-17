import { injectable } from "tsyringe";
import { prisma, Prisma } from "@/libs/prismaClient";
import { civilDayToDate } from "../domain/periodWindows";
import type {
  ITrafficConsolidationRepository,
  TrafficConsolidationResult,
} from "../application/ports/ITrafficConsolidationRepository";
import type { TrafficDaySnapshot } from "../application/ports/ITrafficConsolidationSource";

/**
 * Persistência da consolidação Redis → PostgreSQL.
 *
 * Todo upsert usa GREATEST: o banco nunca regride quando o Redis reinicia e
 * volta a zero (ou perde parte do buffer). A primeira regressão observada no
 * dia também incrementa `lostUpdates`, expondo a perda na API.
 */
@injectable()
export class PrismaTrafficConsolidationRepository implements ITrafficConsolidationRepository {
  async persistDay(snapshot: TrafficDaySnapshot): Promise<TrafficConsolidationResult> {
    const day = civilDayToDate(snapshot.day);
    const statements: Prisma.PrismaPromise<number>[] = [];

    for (const area of snapshot.areas) {
      statements.push(
        prisma.$executeRaw`
          INSERT INTO "site_traffic_daily"
            ("day", "area", "visits", "visitors", "sessions", "lostUpdates")
          VALUES
            (${day}, ${area.area}, ${area.visits}, ${area.visitors}, ${area.sessions}, 0)
          ON CONFLICT ("day", "area") DO UPDATE SET
            "visits" = GREATEST("site_traffic_daily"."visits", EXCLUDED."visits"),
            "visitors" = GREATEST("site_traffic_daily"."visitors", EXCLUDED."visitors"),
            "sessions" = GREATEST("site_traffic_daily"."sessions", EXCLUDED."sessions"),
            "lostUpdates" = "site_traffic_daily"."lostUpdates" + CASE
              WHEN "site_traffic_daily"."lostUpdates" = 0
                AND (
                  EXCLUDED."visits" < "site_traffic_daily"."visits"
                  OR EXCLUDED."visitors" < "site_traffic_daily"."visitors"
                  OR EXCLUDED."sessions" < "site_traffic_daily"."sessions"
                )
              THEN 1
              ELSE 0
            END
        `,
      );
    }

    for (const hour of snapshot.hours) {
      statements.push(
        prisma.$executeRaw`
          INSERT INTO "site_traffic_hourly"
            ("day", "hour", "area", "visits", "visitors")
          VALUES
            (${day}, ${hour.hour}, ${hour.area}, ${hour.visits}, ${hour.visitors})
          ON CONFLICT ("day", "hour", "area") DO UPDATE SET
            "visits" = GREATEST("site_traffic_hourly"."visits", EXCLUDED."visits"),
            "visitors" = GREATEST("site_traffic_hourly"."visitors", EXCLUDED."visitors")
        `,
      );
    }

    for (const origin of snapshot.origins) {
      statements.push(
        prisma.$executeRaw`
          INSERT INTO "site_traffic_origin_daily"
            ("day", "origin", "visits")
          VALUES
            (${day}, ${origin.origin}, ${origin.visits})
          ON CONFLICT ("day", "origin") DO UPDATE SET
            "visits" = GREATEST("site_traffic_origin_daily"."visits", EXCLUDED."visits")
        `,
      );
    }

    // Tráfego por salão/organização (chave de atribuição `b:`/`o:`).
    for (const salon of snapshot.salons) {
      statements.push(
        prisma.$executeRaw`
          INSERT INTO "salon_traffic_daily"
            ("day", "target", "visits", "visitors")
          VALUES
            (${day}, ${salon.target}, ${salon.visits}, ${salon.visitors})
          ON CONFLICT ("day", "target") DO UPDATE SET
            "visits" = GREATEST("salon_traffic_daily"."visits", EXCLUDED."visits"),
            "visitors" = GREATEST("salon_traffic_daily"."visitors", EXCLUDED."visitors")
        `,
      );

      for (const section of salon.sections) {
        statements.push(
          prisma.$executeRaw`
            INSERT INTO "salon_traffic_section_daily"
              ("day", "target", "section", "visits", "visitors")
            VALUES
              (${day}, ${salon.target}, ${section.section}, ${section.visits}, ${section.visitors})
            ON CONFLICT ("day", "target", "section") DO UPDATE SET
              "visits" = GREATEST("salon_traffic_section_daily"."visits", EXCLUDED."visits"),
              "visitors" = GREATEST("salon_traffic_section_daily"."visitors", EXCLUDED."visitors")
          `,
        );
      }

      for (const hour of salon.hours) {
        statements.push(
          prisma.$executeRaw`
            INSERT INTO "salon_traffic_hourly"
              ("day", "hour", "target", "visits", "visitors")
            VALUES
              (${day}, ${hour.hour}, ${salon.target}, ${hour.visits}, ${hour.visitors})
            ON CONFLICT ("day", "hour", "target") DO UPDATE SET
              "visits" = GREATEST("salon_traffic_hourly"."visits", EXCLUDED."visits"),
              "visitors" = GREATEST("salon_traffic_hourly"."visitors", EXCLUDED."visitors")
          `,
        );
      }

      for (const origin of salon.origins) {
        statements.push(
          prisma.$executeRaw`
            INSERT INTO "salon_traffic_origin_daily"
              ("day", "target", "origin", "visits")
            VALUES
              (${day}, ${salon.target}, ${origin.origin}, ${origin.visits})
            ON CONFLICT ("day", "target", "origin") DO UPDATE SET
              "visits" = GREATEST("salon_traffic_origin_daily"."visits", EXCLUDED."visits")
          `,
        );
      }
    }

    if (statements.length > 0) {
      await prisma.$transaction(statements);
    }

    return {
      day: snapshot.day,
      areas: snapshot.areas.length,
      hours: snapshot.hours.length,
      origins: snapshot.origins.length,
      salons: snapshot.salons.length,
    };
  }

  /**
   * Limpeza de retenção: apaga agregados de salão com mais de 13 meses.
   *
   * O contrato pede 13 meses de agregados (permite comparar com o mesmo
   * período do ano anterior). As tabelas do beacon global (`site_traffic_*`)
   * mantêm a retenção preexistente — esta limpeza só toca no tráfego de
   * salão.
   */
  async purgeOlderThan(cutoffDayKey: string): Promise<number> {
    const cutoff = civilDayToDate(cutoffDayKey);
    const removed = await prisma.$transaction([
      prisma.salonTrafficDaily.deleteMany({ where: { day: { lt: cutoff } } }),
      prisma.salonTrafficHourly.deleteMany({ where: { day: { lt: cutoff } } }),
      prisma.salonTrafficSectionDaily.deleteMany({ where: { day: { lt: cutoff } } }),
      prisma.salonTrafficOriginDaily.deleteMany({ where: { day: { lt: cutoff } } }),
    ]);
    return removed.reduce((total, result) => total + result.count, 0);
  }
}
