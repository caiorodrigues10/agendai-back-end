/// <reference types="vitest/globals" />
/**
 * Provas de persistência do tráfego:
 * - consolidação idempotente com GREATEST e sinal de regressão/reset do Redis;
 * - atividade por usuário/dia deduplicada no Redis;
 * - limites civis de São Paulo;
 * - tabelas de plataforma inacessíveis a papel NOSUPERUSER/NOBYPASSRLS.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/libs/prismaClient";
import { getApiRedisConnection } from "@/shared/infra/queue/redisConnection";
import { recordUserActivity } from "@/modules/traffic/infra/userActivity";
import { PrismaTrafficConsolidationRepository } from "@/modules/traffic/infra/trafficConsolidationRepository";
import { PrismaTrafficReportRepository } from "@/modules/traffic/infra/trafficReportRepository";
import { RedisTrafficConsolidationSource } from "@/modules/traffic/infra/redisTrafficConsolidationSource";
import { spDayKey } from "@/modules/traffic/domain/periodWindows";
import * as trafficKeys from "@/modules/traffic/infra/trafficKeys";
import { startPostgresHarness, type PostgresHarness } from "../helpers/postgres";

const TEST_DAY = "2098-12-10";
const PREVIOUS_TEST_DAY = "2098-12-09";
const ACTIVITY_TEST_DAY = "2098-12-11";
const PRIVILEGE_ROLE = "traffic_privilege_probe";
const TRAFFIC_TABLES = [
  "site_traffic_daily",
  "site_traffic_hourly",
  "site_traffic_origin_daily",
  "user_activity_daily",
] as const;

function migrationSql(): string {
  return readFileSync(
    join(
      process.cwd(),
      "prisma",
      "migrations",
      "20261115120000_site_traffic_tracking",
      "migration.sql",
    ),
    "utf8",
  );
}

function migrationStatement(startMarker: string): string {
  const sql = migrationSql();
  const start = sql.indexOf(startMarker);
  if (start < 0) throw new Error(`Migration sem marcador: ${startMarker}`);
  const end = sql.indexOf(";", start);
  if (end < 0) throw new Error(`Migration sem fim de statement: ${startMarker}`);
  return sql.slice(start, end + 1);
}

describe("persistência de tráfego — Postgres + Redis", () => {
  let harness: PostgresHarness;
  const createdUserIds: string[] = [];
  const createdShopIds: string[] = [];
  const createdAccessLogIds: string[] = [];

  beforeAll(async () => {
    harness = await startPostgresHarness();
  }, 180_000);

  afterAll(async () => {
    await cleanupRole();
    await cleanupTestRows();
    await harness?.stop();
  });

  async function cleanupTestRows(): Promise<void> {
    const redis = getApiRedisConnection();
    for (const day of [TEST_DAY, PREVIOUS_TEST_DAY, ACTIVITY_TEST_DAY]) {
      let cursor = "0";
      do {
        const [next, found] = await redis.scan(
          cursor,
          "MATCH",
          `traffic:*:${day}*`,
          "COUNT",
          200,
        );
        cursor = next;
        if (found.length > 0) await redis.del(...found);
      } while (cursor !== "0");
    }

    await prisma.userActivityDaily.deleteMany({
      where: {
        OR: [
          { userId: { in: createdUserIds } },
          { day: { in: [new Date(`${TEST_DAY}T00:00:00.000Z`), new Date(`${ACTIVITY_TEST_DAY}T00:00:00.000Z`)] } },
        ],
      },
    });
    await prisma.siteTrafficOriginDaily.deleteMany({
      where: { day: new Date(`${TEST_DAY}T00:00:00.000Z`) },
    });
    await prisma.siteTrafficHourly.deleteMany({
      where: { day: new Date(`${TEST_DAY}T00:00:00.000Z`) },
    });
    await prisma.siteTrafficDaily.deleteMany({
      where: {
        day: {
          in: [
            new Date(`${TEST_DAY}T00:00:00.000Z`),
            new Date(`${PREVIOUS_TEST_DAY}T00:00:00.000Z`),
          ],
        },
      },
    });
    if (createdAccessLogIds.length > 0) {
      await prisma.accessLog.deleteMany({ where: { id: { in: createdAccessLogIds } } });
    }
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    if (createdShopIds.length > 0) {
      await prisma.barbershop.deleteMany({ where: { id: { in: createdShopIds } } });
    }
  }

  async function cleanupRole(): Promise<void> {
    const rows = await prisma.$queryRawUnsafe<{ exists: boolean }[]>(
      "SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname = $1) AS exists",
      PRIVILEGE_ROLE,
    );
    if (!rows[0]?.exists) return;
    await prisma.$executeRawUnsafe(`REVOKE ALL ON ${TRAFFIC_TABLES.join(", ")} FROM ${PRIVILEGE_ROLE}`);
    await prisma.$executeRawUnsafe(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${PRIVILEGE_ROLE}`);
    await prisma.$executeRawUnsafe(`REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM ${PRIVILEGE_ROLE}`);
    await prisma.$executeRawUnsafe(`REVOKE USAGE ON SCHEMA public FROM ${PRIVILEGE_ROLE}`);
    await prisma.$executeRawUnsafe(`DROP ROLE IF EXISTS ${PRIVILEGE_ROLE}`);
  }

  it("preserva o maior valor no GREATEST e registra reset/regressão do Redis", async () => {
    const redis = getApiRedisConnection();
    const day = new Date(`${TEST_DAY}T00:00:00.000Z`);
    await prisma.siteTrafficDaily.deleteMany({ where: { day } });
    await prisma.siteTrafficHourly.deleteMany({ where: { day } });
    await prisma.siteTrafficOriginDaily.deleteMany({ where: { day } });

    await redis.set(trafficKeys.visitsKey(TEST_DAY, "public_site"), "10");
    await redis.set(trafficKeys.sessionCountKey(TEST_DAY, "public_site"), "7");
    await redis.pfadd(trafficKeys.visitorsKey(TEST_DAY, "public_site"), "visitor-a");
    await redis.set(trafficKeys.hourlyVisitsKey(TEST_DAY, 12, "public_site"), "6");
    await redis.pfadd(
      trafficKeys.hourlyVisitorsKey(TEST_DAY, 12, "public_site"),
      "visitor-a",
    );
    await redis.sadd(trafficKeys.originRegistryKey(TEST_DAY), "example.com");
    await redis.set(trafficKeys.originKey(TEST_DAY, "example.com"), "5");

    const source = new RedisTrafficConsolidationSource();
    const repository = new PrismaTrafficConsolidationRepository();

    const first = await source.readDay(TEST_DAY);
    expect(first.areas.find((row) => row.area === "public_site")).toMatchObject({
      visits: 10,
      visitors: 1,
      sessions: 7,
    });
    await repository.persistDay(first);

    let persisted = await prisma.siteTrafficDaily.findUnique({
      where: { day_area: { day, area: "public_site" } },
    });
    expect(persisted).toMatchObject({
      visits: 10,
      visitors: 1,
      sessions: 7,
      lostUpdates: 0,
    });

    // Simula restart/reset: os contadores do Redis voltam a zero.
    await redis.del(
      trafficKeys.visitsKey(TEST_DAY, "public_site"),
      trafficKeys.visitorsKey(TEST_DAY, "public_site"),
      trafficKeys.sessionCountKey(TEST_DAY, "public_site"),
      trafficKeys.hourlyVisitsKey(TEST_DAY, 12, "public_site"),
      trafficKeys.hourlyVisitorsKey(TEST_DAY, 12, "public_site"),
      trafficKeys.originKey(TEST_DAY, "example.com"),
    );
    await redis.del(trafficKeys.originRegistryKey(TEST_DAY));

    const reset = await source.readDay(TEST_DAY);
    expect(reset.areas.find((row) => row.area === "public_site")).toMatchObject({
      visits: 0,
      visitors: 0,
      sessions: 0,
    });
    await repository.persistDay(reset);

    persisted = await prisma.siteTrafficDaily.findUnique({
      where: { day_area: { day, area: "public_site" } },
    });
    expect(persisted).toMatchObject({
      visits: 10,
      visitors: 1,
      sessions: 7,
      lostUpdates: 1,
    });

    const hourly = await prisma.siteTrafficHourly.findUnique({
      where: {
        day_hour_area: { day, hour: 12, area: "public_site" },
      },
    });
    expect(hourly).toMatchObject({ visits: 6, visitors: 1 });
  });

  it("persiste a linha agregada all e mantém a perda escopada por área", async () => {
    const redis = getApiRedisConnection();
    const day = new Date(`${TEST_DAY}T00:00:00.000Z`);
    await prisma.siteTrafficDaily.deleteMany({ where: { day } });
    await prisma.siteTrafficHourly.deleteMany({ where: { day } });
    await prisma.siteTrafficOriginDaily.deleteMany({ where: { day } });

    for (const area of ["public_site", "all"] as const) {
      await redis.set(trafficKeys.visitsKey(TEST_DAY, area), "2");
      await redis.pfadd(trafficKeys.visitorsKey(TEST_DAY, area), "same-visitor");
      await redis.set(trafficKeys.sessionCountKey(TEST_DAY, area), "1");
    }

    const source = new RedisTrafficConsolidationSource();
    const repository = new PrismaTrafficConsolidationRepository();
    const snapshot = await source.readDay(TEST_DAY);
    expect(snapshot.areas.find((row) => row.area === "all")).toMatchObject({
      visits: 2,
      visitors: 1,
      sessions: 1,
    });

    await repository.persistDay(snapshot);
    const persisted = await prisma.siteTrafficDaily.findUnique({
      where: { day_area: { day, area: "all" } },
    });
    expect(persisted).toMatchObject({
      visits: 2,
      visitors: 1,
      sessions: 1,
      lostUpdates: 0,
    });

    await prisma.siteTrafficDaily.update({
      where: { day_area: { day, area: "public_site" } },
      data: { lostUpdates: 2 },
    });
    await prisma.siteTrafficDaily.update({
      where: { day_area: { day, area: "all" } },
      data: { lostUpdates: 1 },
    });

    const reportRepository = new PrismaTrafficReportRepository();
    expect(await reportRepository.findDaily(TEST_DAY, TEST_DAY, "all")).toEqual([
      expect.objectContaining({ area: "all", visits: 2 }),
    ]);
    expect(await reportRepository.sumLostUpdates(TEST_DAY, TEST_DAY, "all")).toBe(1);
    expect(
      await reportRepository.sumLostUpdates(TEST_DAY, TEST_DAY, "public_site"),
    ).toBe(2);
  });

  it("deduplica atividade por usuário/dia e conta usuários distintos no período", async () => {
    const userA = await prisma.user.create({
      data: {
        name: "Atividade A",
        email: `traffic-activity-a-${randomUUID()}@example.test`,
        password: "not-a-real-password",
      },
    });
    const userB = await prisma.user.create({
      data: {
        name: "Atividade B",
        email: `traffic-activity-b-${randomUUID()}@example.test`,
        password: "not-a-real-password",
      },
    });
    createdUserIds.push(userA.id, userB.id);

    const upsert = vi.spyOn(prisma.userActivityDaily, "upsert");
    const now = new Date(`${ACTIVITY_TEST_DAY}T12:00:00.000Z`);

    await recordUserActivity(userA.id, now);
    await recordUserActivity(userA.id, now);
    await recordUserActivity(userB.id, now);
    await recordUserActivity(userA.id, new Date("2098-12-12T12:00:00.000Z"));

    expect(upsert).toHaveBeenCalledTimes(3);
    const day = new Date(`${ACTIVITY_TEST_DAY}T00:00:00.000Z`);
    expect(
      await prisma.userActivityDaily.count({
        where: { day, userId: { in: [userA.id, userB.id] } },
      }),
    ).toBe(2);

    const repo = new PrismaTrafficReportRepository();
    expect(await repo.countDistinctActiveUsers(ACTIVITY_TEST_DAY, ACTIVITY_TEST_DAY)).toBe(2);
    expect(await repo.countDistinctActiveUsers(ACTIVITY_TEST_DAY, "2098-12-12")).toBe(2);

    const earliestUser = await prisma.user.create({
      data: {
        name: "Atividade mais antiga",
        email: `traffic-activity-earliest-${randomUUID()}@example.test`,
        password: "not-a-real-password",
      },
    });
    createdUserIds.push(earliestUser.id);
    await recordUserActivity(
      earliestUser.id,
      new Date("1990-01-01T12:00:00.000Z"),
    );
    expect(await repo.getFirstActivityDay()).toBe("1990-01-01");
  });

  it("faz o backfill da migration por userId ou e-mail normalizado, limitado a seis meses", async () => {
    const recent = new Date(Date.now() - 60 * 60 * 1000);
    const old = new Date();
    old.setUTCMonth(old.getUTCMonth() - 7);

    const passwordUser = await prisma.user.create({
      data: {
        name: "Backfill por e-mail",
        email: `Traffic.Backfill.Email.${randomUUID()}@Example.Test`,
        password: "not-a-real-password",
      },
    });
    const googleUser = await prisma.user.create({
      data: {
        name: "Backfill por userId",
        email: `traffic-backfill-google-${randomUUID()}@example.test`,
        password: "not-a-real-password",
      },
    });
    const refreshUser = await prisma.user.create({
      data: {
        name: "Backfill de refresh",
        email: `traffic-backfill-refresh-${randomUUID()}@example.test`,
        password: "not-a-real-password",
      },
    });
    const failedUser = await prisma.user.create({
      data: {
        name: "Login falho",
        email: `traffic-backfill-failed-${randomUUID()}@example.test`,
        password: "not-a-real-password",
      },
    });
    const oldUser = await prisma.user.create({
      data: {
        name: "Evento antigo",
        email: `traffic-backfill-old-${randomUUID()}@example.test`,
        password: "not-a-real-password",
      },
    });
    createdUserIds.push(
      passwordUser.id,
      googleUser.id,
      refreshUser.id,
      failedUser.id,
      oldUser.id,
    );

    const logs = await Promise.all([
      prisma.accessLog.create({
        data: {
          userId: null,
          email: passwordUser.email.toLowerCase(),
          action: "LOGIN",
          success: true,
          createdAt: recent,
        },
      }),
      prisma.accessLog.create({
        data: {
          userId: googleUser.id,
          email: googleUser.email,
          action: "GOOGLE_LOGIN",
          success: true,
          createdAt: recent,
        },
      }),
      prisma.accessLog.create({
        data: {
          userId: refreshUser.id,
          email: refreshUser.email,
          action: "REFRESH",
          success: true,
          createdAt: recent,
        },
      }),
      prisma.accessLog.create({
        data: {
          userId: failedUser.id,
          email: failedUser.email,
          action: "LOGIN",
          success: false,
          createdAt: recent,
        },
      }),
      prisma.accessLog.create({
        data: {
          userId: oldUser.id,
          email: oldUser.email,
          action: "REFRESH",
          success: true,
          createdAt: old,
        },
      }),
    ]);
    createdAccessLogIds.push(...logs.map((log) => log.id));

    await prisma.userActivityDaily.deleteMany({
      where: {
        userId: {
          in: [
            passwordUser.id,
            googleUser.id,
            refreshUser.id,
            failedUser.id,
            oldUser.id,
          ],
        },
      },
    });

    const backfill = migrationStatement('INSERT INTO "user_activity_daily"');
    await prisma.$executeRawUnsafe(backfill);

    const expectedDay = new Date(`${spDayKey(recent)}T00:00:00.000Z`);
    const activity = await prisma.userActivityDaily.findMany({
      where: {
        userId: {
          in: [
            passwordUser.id,
            googleUser.id,
            refreshUser.id,
            failedUser.id,
            oldUser.id,
          ],
        },
      },
    });
    expect(activity.map((row) => row.userId).sort()).toEqual(
      [passwordUser.id, googleUser.id, refreshUser.id].sort(),
    );
    expect(activity.every((row) => row.day.getTime() === expectedDay.getTime())).toBe(true);
  });

  it("concede a nova permissão aos admins internos com lista explícita sem duplicar", async () => {
    const explicit = await prisma.user.create({
      data: {
        name: "Admin com lista explícita",
        email: `traffic-permission-explicit-${randomUUID()}@example.test`,
        password: "not-a-real-password",
        role: "MASTER_ADMIN",
        permissions: ["internal:dashboard:read"],
      },
    });
    const global = await prisma.user.create({
      data: {
        name: "Admin global",
        email: `traffic-permission-global-${randomUUID()}@example.test`,
        password: "not-a-real-password",
        role: "MASTER_ADMIN",
        permissions: ["internal:all"],
      },
    });
    const empty = await prisma.user.create({
      data: {
        name: "Admin sem lista",
        email: `traffic-permission-empty-${randomUUID()}@example.test`,
        password: "not-a-real-password",
        role: "MASTER_ADMIN",
        permissions: [],
      },
    });
    createdUserIds.push(explicit.id, global.id, empty.id);

    const update = migrationStatement('UPDATE "users"');
    await prisma.$executeRawUnsafe(update);

    const users = await prisma.user.findMany({
      where: { id: { in: [explicit.id, global.id, empty.id] } },
    });
    const explicitAfter = users.find((user) => user.id === explicit.id)!;
    const globalAfter = users.find((user) => user.id === global.id)!;
    const emptyAfter = users.find((user) => user.id === empty.id)!;

    expect(explicitAfter.permissions).toContain("internal:traffic:read");
    expect(
      explicitAfter.permissions.filter(
        (permission) => permission === "internal:traffic:read",
      ),
    ).toHaveLength(1);
    expect(globalAfter.permissions).toEqual(["internal:all"]);
    expect(emptyAfter.permissions).toEqual([]);
  });

  it("aplica os limites civis de São Paulo e separa usuários removidos", async () => {
    const beforeBoundary = new Date("2098-12-09T02:59:59.000Z");
    const atBoundary = new Date("2098-12-09T03:00:00.000Z");
    const beforeNextBoundary = new Date("2098-12-10T02:59:59.000Z");

    const users = await Promise.all([
      prisma.user.create({
        data: {
          name: "Antes da meia-noite",
          email: `traffic-boundary-before-${randomUUID()}@example.test`,
          password: "not-a-real-password",
          createdAt: beforeBoundary,
        },
      }),
      prisma.user.create({
        data: {
          name: "Na meia-noite",
          email: `traffic-boundary-at-${randomUUID()}@example.test`,
          password: "not-a-real-password",
          createdAt: atBoundary,
          deletedAt: atBoundary,
        },
      }),
      prisma.user.create({
        data: {
          name: "Antes da meia-noite seguinte",
          email: `traffic-boundary-after-${randomUUID()}@example.test`,
          password: "not-a-real-password",
          createdAt: beforeNextBoundary,
        },
      }),
    ]);
    createdUserIds.push(...users.map((user) => user.id));

    const shops = await Promise.all([
      prisma.barbershop.create({
        data: {
          name: "Salão antes da meia-noite",
          whatsapp: `1199${randomUUID().replace(/-/g, "").slice(0, 8)}`,
          createdAt: beforeBoundary,
        },
      }),
      prisma.barbershop.create({
        data: {
          name: "Salão na meia-noite",
          whatsapp: `1199${randomUUID().replace(/-/g, "").slice(0, 8)}`,
          createdAt: atBoundary,
        },
      }),
      prisma.barbershop.create({
        data: {
          name: "Salão antes da meia-noite seguinte",
          whatsapp: `1199${randomUUID().replace(/-/g, "").slice(0, 8)}`,
          createdAt: beforeNextBoundary,
        },
      }),
    ]);
    createdShopIds.push(...shops.map((shop) => shop.id));

    const repo = new PrismaTrafficReportRepository();
    const usersOnDay = await repo.countNewUsersByDay(PREVIOUS_TEST_DAY, PREVIOUS_TEST_DAY);
    const usersOnPreviousDay = await repo.countNewUsersByDay("2098-12-08", "2098-12-08");
    const shopsOnDay = await repo.countNewShopsByDay(PREVIOUS_TEST_DAY, PREVIOUS_TEST_DAY);

    expect(usersOnDay).toEqual([{ day: PREVIOUS_TEST_DAY, total: 2, removed: 1 }]);
    expect(usersOnPreviousDay).toEqual([{ day: "2098-12-08", total: 1, removed: 0 }]);
    expect(shopsOnDay).toEqual([{ day: PREVIOUS_TEST_DAY, total: 2 }]);
  });

  it("não concede privilégios a papel NOSUPERUSER/NOBYPASSRLS", async () => {
    await cleanupRole();
    await prisma.$executeRawUnsafe(
      `CREATE ROLE ${PRIVILEGE_ROLE} NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION LOGIN`,
    );

    const [role] = await prisma.$queryRawUnsafe<
      { rolsuper: boolean; rolbypassrls: boolean }[]
    >("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = $1", PRIVILEGE_ROLE);
    expect(role).toEqual({ rolsuper: false, rolbypassrls: false });

    for (const table of TRAFFIC_TABLES) {
      const [privilege] = await prisma.$queryRawUnsafe<{ allowed: boolean }[]>(
        "SELECT has_table_privilege($1, $2, 'SELECT') AS allowed",
        PRIVILEGE_ROLE,
        table,
      );
      expect(privilege?.allowed).toBe(false);
    }

    const publicGrants = await prisma.$queryRawUnsafe<{ count: number }[]>(
      `
        SELECT count(*)::int AS count
        FROM pg_class c
        CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, '{}'::aclitem[])) acl
        WHERE c.relname = ANY($1::text[])
          AND acl.grantee = 0
      `,
      [...TRAFFIC_TABLES],
    );
    expect(Number(publicGrants[0]?.count)).toBe(0);

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET ROLE ${PRIVILEGE_ROLE}`);
        await tx.$queryRawUnsafe('SELECT * FROM "user_activity_daily"');
      }),
    ).rejects.toThrow();

    await cleanupRole();
  });
});
