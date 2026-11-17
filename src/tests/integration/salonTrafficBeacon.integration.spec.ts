/// <reference types="vitest/globals" />
/**
 * Integração do beacon de salão + relatório do dono (Postgres e Redis reais):
 *
 *  - `POST /api/ping` aceita o payload de atribuição e conta visita/visitante
 *    por salão (e por organização, no caso do slug);
 *  - pings incoerentes (kind/salonType/salon/rota) são descartados em silêncio
 *    (sempre 204 — sem sinal de enumeração de ids);
 *  - pings `tab` alimentam SOMENTE a quebra por seção;
 *  - `GET /api/barbershops/:id/traffic` exige o dono do salão (ou o master) e
 *    devolve o payload no formato do frontend (`SalonTrafficData`);
 *  - privacidade: IP, user agent e hash diário nunca aparecem na resposta, no
 *    Redis nem no banco.
 */
import { randomUUID } from "node:crypto";
import { sign, type Secret } from "jsonwebtoken";
import type { FastifyInstance } from "fastify";
import { container } from "tsyringe";
import auth from "@/config/auth";
import { prisma } from "@/libs/prismaClient";
import { getApiRedisConnection } from "@/shared/infra/queue/redisConnection";
import { spDayKey } from "@/modules/traffic/domain/periodWindows";
import { RedisTrafficCounter } from "@/modules/traffic/infra/redisTrafficCounter";
import { consolidateTrafficDays } from "@/modules/traffic/infra/trafficConsolidation.cron";
import { ConsolidateTrafficUseCase } from "@/modules/traffic/application/useCases/ConsolidateTrafficUseCase";
import * as trafficKeys from "@/modules/traffic/infra/trafficKeys";
import { startPostgresHarness, type PostgresHarness } from "../helpers/postgres";
import { createTestApp, closeTestApp } from "../helpers/createTestApp";

const ALLOWED_ORIGIN = "https://app.traffic.example.com";
const USER_AGENT = "Mozilla/5.0 (Macintosh) Chrome/126 Safari/537.36";

interface ShopFixture {
  id: string;
  name: string;
  whatsapp: string;
}

interface UserFixture {
  id: string;
  role: string;
}

describe("beacon de salão e relatório do dono — HTTP real", () => {
  let app: FastifyInstance;
  let harness: PostgresHarness;
  const createdUserIds: string[] = [];
  const createdShopIds: string[] = [];
  const createdOrgIds: string[] = [];

  let shop: ShopFixture;
  let otherShop: ShopFixture;
  let owner: UserFixture;
  let otherOwner: UserFixture;
  let employee: UserFixture;
  let master: UserFixture;
  let organizationId: string;
  let organizationSlug: string;

  const originalEnv = {
    TRUST_PROXY: process.env.TRUST_PROXY,
    TRAFFIC_BEACON_ENABLED: process.env.TRAFFIC_BEACON_ENABLED,
    TRAFFIC_RATE_LIMIT_MAX: process.env.TRAFFIC_RATE_LIMIT_MAX,
    TRAFFIC_IGNORE_HOSTS: process.env.TRAFFIC_IGNORE_HOSTS,
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
  };

  beforeAll(async () => {
    harness = await startPostgresHarness();
    process.env.TRUST_PROXY = "1";
    process.env.TRAFFIC_BEACON_ENABLED = "true";
    process.env.TRAFFIC_RATE_LIMIT_MAX = "1000";
    process.env.TRAFFIC_IGNORE_HOSTS = "";
    process.env.ALLOWED_ORIGINS = ALLOWED_ORIGIN;
    app = await createTestApp();

    shop = await prisma.barbershop.create({
      data: {
        name: "Salão do Beacon QA",
        whatsapp: `1199${randomUUID().replace(/-/g, "").slice(0, 8)}`,
      },
    });
    createdShopIds.push(shop.id);

    otherShop = await prisma.barbershop.create({
      data: {
        name: "Outro Salão QA",
        whatsapp: `1199${randomUUID().replace(/-/g, "").slice(0, 8)}`,
      },
    });
    createdShopIds.push(otherShop.id);

    owner = await prisma.user.create({
      data: {
        name: "Dono do Beacon QA",
        email: `salon-owner-${randomUUID()}@example.test`,
        password: "not-a-real-password",
        role: "OWNER",
        barbershopId: shop.id,
      },
      select: { id: true, role: true },
    });
    createdUserIds.push(owner.id);

    otherOwner = await prisma.user.create({
      data: {
        name: "Dono de Outro Salão QA",
        email: `salon-other-owner-${randomUUID()}@example.test`,
        password: "not-a-real-password",
        role: "OWNER",
        barbershopId: otherShop.id,
      },
      select: { id: true, role: true },
    });
    createdUserIds.push(otherOwner.id);

    employee = await prisma.user.create({
      data: {
        name: "Funcionário do Salão QA",
        email: `salon-employee-${randomUUID()}@example.test`,
        password: "not-a-real-password",
        role: "EMPLOYEE",
        barbershopId: shop.id,
        permissions: ["REPORTS_VIEW"],
      },
      select: { id: true, role: true },
    });
    createdUserIds.push(employee.id);

    master = await prisma.user.create({
      data: {
        name: "Master do Beacon QA",
        email: `salon-master-${randomUUID()}@example.test`,
        password: "not-a-real-password",
        role: "MASTER_ADMIN",
      },
      select: { id: true, role: true },
    });
    createdUserIds.push(master.id);

    organizationSlug = `salon-org-${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const organization = await prisma.organization.create({
      data: {
        name: "Organização do Beacon QA",
        slug: organizationSlug,
        ownerId: owner.id,
      },
    });
    organizationId = organization.id;
    createdOrgIds.push(organization.id);

    await prisma.barbershop.update({
      where: { id: shop.id },
      data: { organizationId: organization.id },
    });
  }, 180_000);

  afterAll(async () => {
    await cleanupRedis();
    await cleanupPersisted();
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    if (createdOrgIds.length > 0) {
      await prisma.organization.deleteMany({ where: { id: { in: createdOrgIds } } });
    }
    if (createdShopIds.length > 0) {
      await prisma.barbershop.deleteMany({ where: { id: { in: createdShopIds } } });
    }
    if (app) await closeTestApp(app);
    await harness?.stop();
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  beforeEach(async () => {
    process.env.TRAFFIC_BEACON_ENABLED = "true";
    process.env.TRAFFIC_RATE_LIMIT_MAX = "1000";
    await cleanupRedis();
    await cleanupPersisted();
  });

  async function cleanupRedis(): Promise<void> {
    const redis = getApiRedisConnection();
    let cursor = "0";
    do {
      const [next, found] = await redis.scan(cursor, "MATCH", "traffic:*", "COUNT", 500);
      cursor = next;
      if (found.length > 0) await redis.del(...found);
    } while (cursor !== "0");
  }

  async function cleanupPersisted(): Promise<void> {
    await prisma.salonTrafficDaily.deleteMany({});
    await prisma.salonTrafficHourly.deleteMany({});
    await prisma.salonTrafficSectionDaily.deleteMany({});
    await prisma.salonTrafficOriginDaily.deleteMany({});
  }

  function tokenFor(user: UserFixture, barbershopId?: string): string {
    return sign(
      { role: user.role, ...(barbershopId ? { barbershopId } : {}) },
      auth.secret as Secret,
      { subject: user.id, expiresIn: "5m" },
    );
  }

  async function ping(payload: unknown, options: { ip?: string } = {}) {
    return app.inject({
      method: "POST",
      url: "/api/ping",
      remoteAddress: "10.0.0.10",
      headers: {
        origin: ALLOWED_ORIGIN,
        "user-agent": USER_AGENT,
        "content-type": "text/plain",
        ...(options.ip ? { "x-forwarded-for": options.ip } : {}),
      },
      payload: typeof payload === "string" ? payload : JSON.stringify(payload),
    });
  }

  async function report(
    user: UserFixture | null,
    barbershopId: string,
    query = "period=day",
  ) {
    return app.inject({
      method: "GET",
      url: `/api/barbershops/${barbershopId}/traffic?${query}`,
      headers: user
        ? { authorization: `Bearer ${tokenFor(user, user.role === "MASTER_ADMIN" ? undefined : barbershopId)}` }
        : {},
    });
  }

  async function salonCounters(target: string) {
    const redis = getApiRedisConnection();
    const day = spDayKey(new Date());
    const [visits, visitors, queueVisits] = await Promise.all([
      redis.get(trafficKeys.salonVisitsKey(day, target)),
      redis.pfcount(trafficKeys.salonVisitorsKey(day, target)),
      redis.get(trafficKeys.salonSectionVisitsKey(day, target, "queue")),
    ]);
    return {
      visits: Number(visits ?? 0),
      visitors: Number(visitors ?? 0),
      queueVisits: Number(queueVisits ?? 0),
    };
  }

  it("conta a visita do salão e o relatório do dono reflete", async () => {
    const response = await ping({
      p: "/queue/:id",
      salon: shop.id,
      salonType: "id",
      kind: "visit",
      tab: "queue",
      r: "www.instagram.com",
    });

    expect(response.statusCode).toBe(204);
    expect(await salonCounters(`b:${shop.id}`)).toEqual({
      visits: 1,
      visitors: 1,
      queueVisits: 1,
    });

    await consolidateTrafficDays(new Date());

    const reportResponse = await report(owner, shop.id);
    expect(reportResponse.statusCode).toBe(200);
    const payload = reportResponse.json().data;

    expect(payload.period).toMatchObject({
      key: "day",
      label: "Hoje",
      granularity: "hour",
      timezone: "America/Sao_Paulo",
    });
    expect(payload.beaconEnabled).toBe(true);
    // Guarda contra o serializador do Fastify (fast-json-stringify) esvaziar
    // o `data` quando o schema OpenAPI da rota declares a resposta.
    expect(Object.keys(payload).sort()).toEqual([
      "beaconEnabled",
      "deltaPct",
      "generatedAt",
      "origins",
      "period",
      "prevTotals",
      "sections",
      "series",
      "totals",
    ]);
    expect(Object.keys(payload.period).sort()).toEqual([
      "dataFrom",
      "fromDay",
      "granularity",
      "key",
      "label",
      "prevFromDay",
      "prevToDay",
      "timezone",
      "toDay",
    ]);
    expect(Object.keys(payload.totals).sort()).toEqual([
      "visitors",
      "visitorsBasis",
      "visits",
    ]);
    expect(payload.totals).toEqual({
      visits: 1,
      visitors: 1,
      visitorsBasis: "daily_distinct",
    });
    expect(payload.series).toHaveLength(24);
    expect(payload.series.some((point: { visits: number }) => point.visits === 1)).toBe(true);
    expect(Object.keys(payload.series[0]).sort()).toEqual([
      "bucketStart",
      "label",
      "partial",
      "visitors",
      "visits",
    ]);
    expect(payload.sections).toContainEqual({
      section: "queue",
      visits: 1,
      visitors: 1,
    });
    // Origem = host do referrer (sem path/query).
    expect(payload.origins).toEqual([{ host: "www.instagram.com", visits: 1 }]);
  });

  it("ping de aba alimenta só a seção, sem somar visita nem visitante", async () => {
    const response = await ping({
      p: "/queue/:id",
      salon: shop.id,
      salonType: "id",
      kind: "tab",
      tab: "profile",
    });

    expect(response.statusCode).toBe(204);
    expect(await salonCounters(`b:${shop.id}`)).toEqual({
      visits: 0,
      visitors: 0,
      queueVisits: 0,
    });

    const redis = getApiRedisConnection();
    const day = spDayKey(new Date());
    expect(
      Number(
        await redis.get(trafficKeys.salonSectionVisitsKey(day, `b:${shop.id}`, "profile")),
      ),
    ).toBe(1);

    await consolidateTrafficDays(new Date());
    const payload = (await report(owner, shop.id)).json().data;
    expect(payload.totals.visits).toBe(0);
    expect(payload.totals.visitors).toBe(0);
    expect(payload.sections).toContainEqual({
      section: "profile",
      visits: 1,
      visitors: 1,
    });
  });

  it("descarta em silêncio ping incoerente, de salão inexistente ou de rota inválida", async () => {
    const unknownShopId = randomUUID();
    const responses = await Promise.all([
      // kind fora da allowlist
      ping({
        p: "/queue/:id",
        salon: shop.id,
        salonType: "id",
        kind: "VIEW",
      }),
      // salonType fora da allowlist
      ping({
        p: "/queue/:id",
        salon: shop.id,
        salonType: "uuid",
        kind: "visit",
      }),
      // forma do salon incompatível com o salonType
      ping({
        p: "/queue/:id",
        salon: "acme-barbearia",
        salonType: "id",
        kind: "visit",
      }),
      // rota que não é de salão
      ping({
        p: "/planos",
        salon: shop.id,
        salonType: "id",
        kind: "visit",
      }),
      // salão que não existe
      ping({
        p: "/queue/:id",
        salon: unknownShopId,
        salonType: "id",
        kind: "visit",
      }),
      // /queue/:id sem atribuição
      ping({ p: "/queue/:id" }),
    ]);

    expect(responses.map((response) => response.statusCode)).toEqual([
      204, 204, 204, 204, 204, 204,
    ]);
    expect(await salonCounters(`b:${shop.id}`)).toEqual({
      visits: 0,
      visitors: 0,
      queueVisits: 0,
    });
  });

  it("responde igual (204) para salão existente e inexistente — sem enumeração", async () => {
    const existing = await ping({
      p: "/queue/:id",
      salon: shop.id,
      salonType: "id",
      kind: "visit",
    });
    const missing = await ping({
      p: "/queue/:id",
      salon: randomUUID(),
      salonType: "id",
      kind: "visit",
    });

    expect(existing.statusCode).toBe(missing.statusCode);
    expect(existing.body).toBe(missing.body);
    expect(existing.statusCode).toBe(204);
  });

  it("trata tab fora da allowlist como ausente e ainda conta a visita", async () => {
    const response = await ping({
      p: "/queue/:id",
      salon: shop.id,
      salonType: "id",
      kind: "visit",
      tab: "admin",
    });

    expect(response.statusCode).toBe(204);
    expect(await salonCounters(`b:${shop.id}`)).toEqual({
      visits: 1,
      visitors: 1,
      queueVisits: 1,
    });
  });

  it("descarta o excedente da cota por IP sem quebrar o frontend", async () => {
    process.env.TRAFFIC_RATE_LIMIT_MAX = "1";
    const options = { ip: "203.0.113.99" };

    const first = await ping(
      { p: "/queue/:id", salon: shop.id, salonType: "id", kind: "visit" },
      options,
    );
    const second = await ping(
      { p: "/queue/:id", salon: shop.id, salonType: "id", kind: "visit" },
      options,
    );

    expect(first.statusCode).toBe(204);
    expect(second.statusCode).toBe(204);
    expect(await salonCounters(`b:${shop.id}`)).toMatchObject({ visits: 1 });
  });

  it("atribui o ping de slug à organização", async () => {
    const response = await ping({
      p: "/s/:slug",
      salon: organizationSlug,
      salonType: "slug",
      kind: "visit",
    });

    expect(response.statusCode).toBe(204);
    expect(await salonCounters(`o:${organizationId}`)).toMatchObject({ visits: 1 });
    expect(await salonCounters(`b:${shop.id}`)).toMatchObject({ visits: 0 });
  });

  it("separa o dia civil na virada (23h de um dia, 0h do dia seguinte)", async () => {
    const counter = new RedisTrafficCounter();
    const target = `b:${shop.id}`;

    await counter.recordSalonVisit({
      target,
      section: "queue",
      kind: "visit",
      ip: "203.0.113.10",
      userAgent: USER_AGENT,
      dayKey: "2026-11-15",
      hour: 23,
      originHost: "www.example.com",
    });
    await counter.recordSalonVisit({
      target,
      section: "queue",
      kind: "visit",
      ip: "203.0.113.11",
      userAgent: USER_AGENT,
      dayKey: "2026-11-16",
      hour: 0,
      originHost: "www.example.com",
    });

    const consolidate = container.resolve(ConsolidateTrafficUseCase);
    await consolidate.execute("2026-11-15");
    await consolidate.execute("2026-11-16");

    const daily = await prisma.salonTrafficDaily.findMany({
      where: { target },
      orderBy: { day: "asc" },
    });
    expect(daily.map((row) => row.day.toISOString().slice(0, 10))).toEqual([
      "2026-11-15",
      "2026-11-16",
    ]);
    expect(daily.map((row) => row.visits)).toEqual([1, 1]);

    const hourly = await prisma.salonTrafficHourly.findMany({
      where: { target },
      orderBy: [{ day: "asc" }, { hour: "asc" }],
    });
    expect(hourly.map((row) => [row.day.toISOString().slice(0, 10), row.hour])).toEqual([
      ["2026-11-15", 23],
      ["2026-11-16", 0],
    ]);
  });

  it("exige autenticação e recusa quem não é o dono do salão", async () => {
    const anonymous = await report(null, shop.id);
    expect(anonymous.statusCode).toBe(401);

    const employeeResponse = await report(employee, shop.id);
    expect(employeeResponse.statusCode).toBe(403);

    const otherOwnerResponse = await report(otherOwner, otherShop.id);
    expect(otherOwnerResponse.statusCode).toBe(200);
    // O dono de outro salão não enxerga o relatório deste salão.
    const crossRead = await app.inject({
      method: "GET",
      url: `/api/barbershops/${shop.id}/traffic?period=day`,
      headers: {
        authorization: `Bearer ${tokenFor(otherOwner, otherShop.id)}`,
      },
    });
    expect(crossRead.statusCode).toBe(403);

    const masterResponse = await report(master, shop.id);
    expect(masterResponse.statusCode).toBe(200);
  });

  it("rejeita período inválido ou parâmetro extra na query", async () => {
    const invalidPeriod = await report(owner, shop.id, "period=all");
    expect(invalidPeriod.statusCode).toBe(400);

    const extraParam = await report(owner, shop.id, "period=day&area=all");
    expect(extraParam.statusCode).toBe(400);

    const missingPeriod = await app.inject({
      method: "GET",
      url: `/api/barbershops/${shop.id}/traffic`,
      headers: { authorization: `Bearer ${tokenFor(owner, shop.id)}` },
    });
    expect(missingPeriod.statusCode).toBe(400);
  });

  it("devolve listas vazias quando o salão nunca teve tráfego", async () => {
    const response = await report(owner, otherShop.id);
    expect(response.statusCode).toBe(200);
    const payload = response.json().data;

    expect(payload.totals).toEqual({
      visits: 0,
      visitors: 0,
      visitorsBasis: "daily_distinct",
    });
    expect(payload.prevTotals).toBeNull();
    expect(payload.deltaPct).toBeNull();
    expect(payload.series).toEqual([]);
    expect(payload.sections).toEqual([]);
    expect(payload.origins).toEqual([]);
  });

  it("não expõe o tráfego de outro salão nem hashes/identificadores", async () => {
    await ping({
      p: "/queue/:id",
      salon: shop.id,
      salonType: "id",
      kind: "visit",
      tab: "queue",
    });
    await consolidateTrafficDays(new Date());

    const response = await report(owner, shop.id);
    const body = response.body;

    expect(body).not.toContain("203.0.113.10");
    expect(body).not.toContain("Mozilla/5.0");
    expect(body).not.toContain(shop.id);
    expect(body).not.toContain(otherShop.id);
    expect(body).not.toContain(organizationId);
    // Nenhum hash de visitante (64 hex) na resposta.
    expect(body).not.toMatch(/[0-9a-f]{64}/i);

    // Nem no Redis: só hash diário (binário), nunca IP/UA em claro.
    const redis = getApiRedisConnection();
    const day = spDayKey(new Date());
    let cursor = "0";
    const keys: string[] = [];
    do {
      const [next, found] = await redis.scan(
        cursor,
        "MATCH",
        `traffic:*:${day}*`,
        "COUNT",
        500,
      );
      cursor = next;
      keys.push(...found);
    } while (cursor !== "0");

    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(key).not.toContain("203.0.113.10");
      expect(key).not.toContain("Mozilla");
      const type = await redis.type(key);
      if (type === "string") {
        const value = (await redis.get(key)) ?? "";
        expect(value).not.toContain("203.0.113.10");
        expect(value).not.toContain("Mozilla");
      }
    }

    // Nem no banco: só contagens agregadas.
    const rows = await prisma.salonTrafficDaily.findMany({});
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(["day", "target", "visitors", "visits"]);
    }

    // A origem é só o host — nunca path/query.
    const originRows = await prisma.salonTrafficOriginDaily.findMany({});
    for (const row of originRows) {
      expect(row.origin).not.toContain("/");
      expect(row.origin).not.toContain("?");
      expect(row.origin).not.toContain("token");
    }
  });

  it("mantém o relatório do dono sem o agregado de outra organização", async () => {
    await ping({
      p: "/queue/:id",
      salon: otherShop.id,
      salonType: "id",
      kind: "visit",
    });
    await consolidateTrafficDays(new Date());

    const response = await report(owner, shop.id);
    expect(response.statusCode).toBe(200);
    expect(response.json().data.totals.visits).toBe(0);
  });
});
