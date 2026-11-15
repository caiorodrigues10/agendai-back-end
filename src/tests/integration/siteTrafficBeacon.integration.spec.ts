/// <reference types="vitest/globals" />
/**
 * Contrato HTTP do beacon e autorização do relatório:
 * - 204 em todos os casos, inclusive Privacy/robots/origin inválida;
 * - feature flag desligada não toca nos contadores;
 * - DNT/GPC, bots e painel master são descartados;
 * - token/manageToken nunca chegam ao Redis;
 * - TRUST_PROXY usa X-Forwarded-For para separar clientes atrás do proxy;
 * - excedente da cota é descartado silenciosamente;
 * - relatório exige MASTER_ADMIN + internal:traffic:read.
 */
import { randomUUID } from "node:crypto";
import { sign } from "jsonwebtoken";
import type { FastifyInstance } from "fastify";
import auth from "@/config/auth";
import { prisma } from "@/libs/prismaClient";
import { getApiRedisConnection } from "@/shared/infra/queue/redisConnection";
import { spDayKey } from "@/modules/traffic/domain/periodWindows";
import { RedisTrafficCounter } from "@/modules/traffic/infra/redisTrafficCounter";
import { consolidateTrafficDays } from "@/modules/traffic/infra/trafficConsolidation.cron";
import * as trafficKeys from "@/modules/traffic/infra/trafficKeys";
import { startPostgresHarness, type PostgresHarness } from "../helpers/postgres";
import { createTestApp, closeTestApp } from "../helpers/createTestApp";

const ALLOWED_ORIGIN = "https://app.traffic.example.com";
const USER_AGENT = "Mozilla/5.0 (Macintosh) Chrome/126 Safari/537.36";

describe("beacon de tráfego e relatório master — HTTP real", () => {
  let app: FastifyInstance;
  let harness: PostgresHarness;
  const createdUserIds: string[] = [];
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
  }, 180_000);

  afterAll(async () => {
    await cleanupRedisDay();
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
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
    await cleanupRedisDay();
  });

  async function cleanupRedisDay(): Promise<void> {
    const redis = getApiRedisConnection();
    const day = spDayKey(new Date());
    const patterns = [`traffic:*:${day}*`, "traffic:rl:*"];
    for (const pattern of patterns) {
      let cursor = "0";
      do {
        const [next, found] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 200);
        cursor = next;
        if (found.length > 0) await redis.del(...found);
      } while (cursor !== "0");
    }
  }

  async function clearPersistedTrafficDay(): Promise<void> {
    const day = new Date(`${spDayKey(new Date())}T00:00:00.000Z`);
    await prisma.siteTrafficHourly.deleteMany({ where: { day } });
    await prisma.siteTrafficOriginDaily.deleteMany({ where: { day } });
    await prisma.siteTrafficDaily.deleteMany({ where: { day } });
  }

  async function beacon(options: {
    body?: string;
    origin?: string;
    userAgent?: string;
    headers?: Record<string, string>;
    remoteAddress?: string;
  } = {}) {
    return app.inject({
      method: "POST",
      url: "/api/ping",
      remoteAddress: options.remoteAddress ?? "10.0.0.10",
      headers: {
        origin: options.origin ?? ALLOWED_ORIGIN,
        "user-agent": options.userAgent ?? USER_AGENT,
        "content-type": "text/plain",
        ...options.headers,
      },
      payload: options.body ?? "p=%2F",
    });
  }

  async function counterState(area = "public_site") {
    const redis = getApiRedisConnection();
    const day = spDayKey(new Date());
    const [visits, visitors, sessions] = await Promise.all([
      redis.get(trafficKeys.visitsKey(day, area)),
      redis.pfcount(trafficKeys.visitorsKey(day, area)),
      redis.get(trafficKeys.sessionCountKey(day, area)),
    ]);
    return {
      visits: Number(visits ?? 0),
      visitors: Number(visitors ?? 0),
      sessions: Number(sessions ?? 0),
    };
  }

  it("mantém o ingestion neutro, em text/plain, e sempre responde 204", async () => {
    const swaggerPaths = Object.keys(app.swagger().paths ?? {});
    expect(swaggerPaths).toContain("/api/ping");
    expect("/api/ping").not.toMatch(/analytics|track|collect|hit/i);
    const pingOperation = (app.swagger().paths?.["/api/ping"] as any)?.post;
    expect(pingOperation?.responses?.["204"]).toBeDefined();
    expect(pingOperation?.responses?.["200"]).toBeUndefined();
    expect(pingOperation?.requestBody?.content?.["text/plain"]).toBeDefined();
    expect(pingOperation?.responses?.["204"]?.content?.["text/plain"]).toBeDefined();

    const valid = await beacon();
    expect(valid.statusCode).toBe(204);
    expect(valid.body).toBe("");

    const malformed = await beacon({ body: "{" });
    expect(malformed.statusCode).toBe(204);

    const unsupportedType = await app.inject({
      method: "POST",
      url: "/api/ping",
      headers: {
        origin: ALLOWED_ORIGIN,
        "user-agent": USER_AGENT,
        "content-type": "application/octet-stream",
      },
      payload: "p=%2F",
    });
    expect(unsupportedType.statusCode).toBe(204);
  });

  it("com a feature desligada responde 204 sem contar", async () => {
    process.env.TRAFFIC_BEACON_ENABLED = "false";

    const response = await beacon();

    expect(response.statusCode).toBe(204);
    expect(await counterState()).toEqual({ visits: 0, visitors: 0, sessions: 0 });
  });

  it("descarta DNT, GPC, bots, painel master e origem não permitida", async () => {
    const responses = await Promise.all([
      beacon({ headers: { dnt: "1" } }),
      beacon({ headers: { "sec-gpc": "1" } }),
      beacon({ headers: { "sec-purpose": "prerender" } }),
      beacon({ userAgent: "Googlebot/2.1" }),
      beacon({ body: "p=%2Fmaster%2Ftraffic" }),
      beacon({ origin: "https://evil.example.com" }),
    ]);

    expect(responses.map((response) => response.statusCode)).toEqual([
      204,
      204,
      204,
      204,
      204,
      204,
    ]);
    expect(await counterState()).toEqual({ visits: 0, visitors: 0, sessions: 0 });
  });

  it("nunca persiste token ou manageToken e reduz o referrer ao host", async () => {
    const secret = `secret-${randomUUID()}`;
    const manageSecret = `manage-${randomUUID()}`;
    const body = `p=%2Fapp%2Fagenda%3Ftoken%3D${secret}%26manageToken%3D${manageSecret}&r=https%3A%2F%2Fwww.example.com%2Fpath%3Ftoken%3D${secret}`;

    const response = await beacon({ body });

    expect(response.statusCode).toBe(204);
    expect(await counterState("logged_area")).toMatchObject({ visits: 1, visitors: 1 });

    const redis = getApiRedisConnection();
    const day = spDayKey(new Date());
    let cursor = "0";
    const found: string[] = [];
    do {
      const [next, keys] = await redis.scan(
        cursor,
        "MATCH",
        `traffic:*:${day}*`,
        "COUNT",
        200,
      );
      cursor = next;
      found.push(...keys);
    } while (cursor !== "0");

    expect(found.length).toBeGreaterThan(0);
    expect(found.some((key) => key.includes("www.example.com"))).toBe(true);
    for (const key of found) {
      expect(key).not.toContain(secret);
      expect(key).not.toContain(manageSecret);
      if ((await redis.type(key)) === "string") {
        const value = await redis.get(key);
        expect(value ?? "").not.toContain(secret);
        expect(value ?? "").not.toContain(manageSecret);
      }
    }
  });

  it("deduplica visitante e sessão globais quando ele muda de área", async () => {
    const options = {
      remoteAddress: "10.0.0.45",
      headers: { "x-forwarded-for": "203.0.113.45" },
    };

    await beacon({ ...options, body: "p=%2F" });
    await beacon({ ...options, body: "p=%2Fapp%2Fagenda" });

    expect(await counterState("public_site")).toEqual({
      visits: 1,
      visitors: 1,
      sessions: 1,
    });
    expect(await counterState("logged_area")).toEqual({
      visits: 1,
      visitors: 1,
      sessions: 1,
    });
    expect(await counterState("all")).toEqual({
      visits: 2,
      visitors: 1,
      sessions: 1,
    });
  });

  it("usa X-Forwarded-For com TRUST_PROXY=1 para separar dois clientes do mesmo proxy", async () => {
    const proxy = "10.0.0.50";
    const first = await beacon({
      remoteAddress: proxy,
      headers: { "x-forwarded-for": "203.0.113.21" },
    });
    const second = await beacon({
      remoteAddress: proxy,
      headers: { "x-forwarded-for": "203.0.113.22" },
    });

    expect(first.statusCode).toBe(204);
    expect(second.statusCode).toBe(204);
    // Se o proxy fosse a identidade, os dois hits seriam um único visitante.
    expect(await counterState()).toEqual({ visits: 2, visitors: 2, sessions: 2 });
  });

  it("descarta o excedente da cota sem resposta de erro e sem nova contagem", async () => {
    process.env.TRAFFIC_RATE_LIMIT_MAX = "1";
    const options = {
      remoteAddress: "10.0.0.60",
      headers: { "x-forwarded-for": "203.0.113.30" },
    };

    const first = await beacon(options);
    const second = await beacon(options);

    expect(first.statusCode).toBe(204);
    expect(second.statusCode).toBe(204);
    expect(await counterState()).toEqual({ visits: 1, visitors: 1, sessions: 1 });
  });

  it("compartilha a cota por IP entre instâncias da API", async () => {
    process.env.TRAFFIC_RATE_LIMIT_MAX = "1";
    const firstReplica = new RedisTrafficCounter();
    const secondReplica = new RedisTrafficCounter();
    const ip = "203.0.113.31";

    expect(await firstReplica.consumeRateLimit(ip)).toBe(true);
    expect(await secondReplica.consumeRateLimit(ip)).toBe(false);
    expect(await firstReplica.consumeRateLimit("203.0.113.32")).toBe(true);
  });

  it("mantém a contagem de origens já registradas quando o limite diário é atingido", async () => {
    const redis = getApiRedisConnection();
    const day = spDayKey(new Date());
    const registryKey = trafficKeys.originRegistryKey(day);
    const registeredOrigin = "registered.example.test";
    const newOrigin = "new.example.test";
    const registeredHosts = Array.from(
      { length: trafficKeys.MAX_ORIGINS_PER_DAY },
      (_, index) => `origin-${index}.example.test`,
    );
    registeredHosts[0] = registeredOrigin;

    await redis.sadd(registryKey, ...registeredHosts);
    await redis.expire(registryKey, trafficKeys.COUNT_TTL_SECONDS);

    const counter = new RedisTrafficCounter();
    await counter.recordVisit({
      area: "public_site",
      ip: "203.0.113.40",
      userAgent: USER_AGENT,
      dayKey: day,
      hour: 12,
      originHost: registeredOrigin,
    });

    expect(await redis.get(trafficKeys.originKey(day, registeredOrigin))).toBe("1");
    expect(await redis.scard(registryKey)).toBe(trafficKeys.MAX_ORIGINS_PER_DAY);

    await counter.recordVisit({
      area: "public_site",
      ip: "203.0.113.41",
      userAgent: USER_AGENT,
      dayKey: day,
      hour: 12,
      originHost: newOrigin,
    });

    expect(await redis.get(trafficKeys.originKey(day, newOrigin))).toBeNull();
    expect(await redis.scard(registryKey)).toBe(trafficKeys.MAX_ORIGINS_PER_DAY);
  });

  it("aplica o limite de origens atomicamente sob concorrência", async () => {
    const redis = getApiRedisConnection();
    const day = spDayKey(new Date());
    const registryKey = trafficKeys.originRegistryKey(day);
    const existingOrigin = "existing-concurrent.example.test";
    const registeredHosts = Array.from(
      { length: trafficKeys.MAX_ORIGINS_PER_DAY - 1 },
      (_, index) => `concurrent-origin-${index}.example.test`,
    );
    registeredHosts[0] = existingOrigin;
    await redis.sadd(registryKey, ...registeredHosts);
    await redis.expire(registryKey, trafficKeys.COUNT_TTL_SECONDS);

    const candidates = Array.from(
      { length: 24 },
      (_, index) => `new-concurrent-origin-${index}.example.test`,
    );
    const counter = new RedisTrafficCounter();
    await Promise.all([
      counter.recordVisit({
        area: "public_site",
        ip: "203.0.113.70",
        userAgent: USER_AGENT,
        dayKey: day,
        hour: 12,
        originHost: existingOrigin,
      }),
      ...candidates.map((originHost, index) =>
        counter.recordVisit({
          area: "public_site",
          ip: `203.0.113.${100 + index}`,
          userAgent: USER_AGENT,
          dayKey: day,
          hour: 12,
          originHost,
        }),
      ),
    ]);

    expect(await redis.scard(registryKey)).toBe(trafficKeys.MAX_ORIGINS_PER_DAY);
    expect(Number(await redis.get(trafficKeys.originKey(day, existingOrigin)))).toBe(1);
    const candidateCounts = await redis.mget(
      ...candidates.map((origin) => trafficKeys.originKey(day, origin)),
    );
    expect(candidateCounts.filter((value) => Number(value ?? 0) > 0)).toHaveLength(1);
  });

  it("consolida e mostra o dia civil corrente no relatório period=day", async () => {
    await clearPersistedTrafficDay();
    const beaconResponse = await beacon({
      remoteAddress: "10.0.0.80",
      headers: { "x-forwarded-for": "203.0.113.80" },
    });
    expect(beaconResponse.statusCode).toBe(204);

    await consolidateTrafficDays(new Date());

    const admin = await createAdmin(["internal:traffic:read"]);
    const reportResponse = await app.inject({
      method: "GET",
      url: "/api/admin/traffic?period=day&area=all",
      headers: { authorization: `Bearer ${tokenFor(admin.id, "MASTER_ADMIN")}` },
    });
    expect(reportResponse.statusCode).toBe(200);
    const payload = reportResponse.json().data;
    expect(payload.totals.visits).toBeGreaterThanOrEqual(1);
    expect(payload.series.some((point: { visits: number }) => point.visits >= 1)).toBe(true);

    const day = new Date(`${spDayKey(new Date())}T00:00:00.000Z`);
    const aggregate = await prisma.siteTrafficDaily.findUnique({
      where: { day_area: { day, area: "all" } },
    });
    expect(aggregate?.visits).toBeGreaterThanOrEqual(1);
    await clearPersistedTrafficDay();
  });

  it("exige MASTER_ADMIN e internal:traffic:read, mantendo acesso default dos admins", async () => {
    const defaultAdmin = await createAdmin([]);
    const scopedAdmin = await createAdmin(["internal:dashboard:read"]);
    const trafficAdmin = await createAdmin(["internal:traffic:read"]);
    const owner = await prisma.user.create({
      data: {
        name: "Owner sem papel master",
        email: `traffic-owner-${randomUUID()}@example.test`,
        password: "not-a-real-password",
        role: "OWNER",
        permissions: ["internal:traffic:read"],
      },
    });
    createdUserIds.push(owner.id);

    const anonymous = await app.inject({ method: "GET", url: "/api/admin/traffic" });
    expect(anonymous.statusCode).toBe(401);

    const ownerResponse = await app.inject({
      method: "GET",
      url: "/api/admin/traffic",
      headers: { authorization: `Bearer ${tokenFor(owner.id, "OWNER")}` },
    });
    expect(ownerResponse.statusCode).toBe(403);

    const scopedResponse = await app.inject({
      method: "GET",
      url: "/api/admin/traffic",
      headers: { authorization: `Bearer ${tokenFor(scopedAdmin.id, "MASTER_ADMIN")}` },
    });
    expect(scopedResponse.statusCode).toBe(403);

    const defaultResponse = await app.inject({
      method: "GET",
      url: "/api/admin/traffic",
      headers: { authorization: `Bearer ${tokenFor(defaultAdmin.id, "MASTER_ADMIN")}` },
    });
    expect(defaultResponse.statusCode).toBe(200);
    expect(defaultResponse.json()).toMatchObject({ success: true });

    const trafficResponse = await app.inject({
      method: "GET",
      url: "/api/admin/traffic?period=day",
      headers: { authorization: `Bearer ${tokenFor(trafficAdmin.id, "MASTER_ADMIN")}` },
    });
    expect(trafficResponse.statusCode).toBe(200);

    const exportResponse = await app.inject({
      method: "GET",
      url: "/api/admin/traffic/export?period=day",
      headers: { authorization: `Bearer ${tokenFor(trafficAdmin.id, "MASTER_ADMIN")}` },
    });
    expect(exportResponse.statusCode).toBe(200);
    expect(exportResponse.headers["content-type"]).toContain("text/csv");
  });

  async function createAdmin(permissions: string[]) {
    const user = await prisma.user.create({
      data: {
        name: "Admin de tráfego",
        email: `traffic-admin-${randomUUID()}@example.test`,
        password: "not-a-real-password",
        role: "MASTER_ADMIN",
        permissions,
      },
    });
    createdUserIds.push(user.id);
    return user;
  }

  function tokenFor(userId: string, role: string): string {
    return sign({ role }, auth.secret, { subject: userId, expiresIn: "5m" });
  }
});
