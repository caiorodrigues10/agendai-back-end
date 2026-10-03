/// <reference types="vitest/globals" />
import fastify, { FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { AppError } from "@/shared/errors/AppError";
import { getRedisConnection } from "@/shared/infra/queue/redisConnection";
import {
  RedisRateLimitStore,
  type RateLimitStoreResult,
} from "./redisRateLimitStore";

vi.mock("@/shared/infra/queue/redisConnection", () => ({
  getRedisConnection: vi.fn(),
}));

const getRedisConnectionMock = vi.mocked(getRedisConnection);

type PipelineMock = {
  incr: ReturnType<typeof vi.fn>;
  pexpire: ReturnType<typeof vi.fn>;
  pttl: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  exec: ReturnType<typeof vi.fn>;
};

function setupRedis() {
  const pipeline: PipelineMock = {
    incr: vi.fn(() => pipeline),
    pexpire: vi.fn(() => pipeline),
    pttl: vi.fn(() => pipeline),
    get: vi.fn(() => pipeline),
    exec: vi.fn(),
  };
  const redis = {
    pipeline: vi.fn(() => pipeline),
    pexpire: vi.fn().mockResolvedValue(1),
    decr: vi.fn().mockResolvedValue(0),
    del: vi.fn().mockResolvedValue(1),
  };
  getRedisConnectionMock.mockReturnValue(
    redis as unknown as ReturnType<typeof getRedisConnection>,
  );
  return { pipeline, redis };
}

function incrAsync(
  store: RedisRateLimitStore,
  key: string,
  max?: number,
  ban?: number,
): Promise<{ error: Error | null; result?: RateLimitStoreResult }> {
  return new Promise((resolve) => {
    store.incr(key, (error, result) => resolve({ error, result }), max, ban);
  });
}

describe("RedisRateLimitStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("usa this.timeWindow para o TTL e ignora max/ban do plugin", async () => {
    const { pipeline } = setupRedis();
    pipeline.exec.mockResolvedValue([[null, 7], [null, 1], [null, 45_000]]);

    const store = new RedisRateLimitStore({ timeWindow: 60_000 });
    const { error, result } = await incrAsync(store, "203.0.113.9", 400, -1);

    expect(error).toBeNull();
    expect(pipeline.incr).toHaveBeenCalledWith("rl:203.0.113.9");
    expect(pipeline.pexpire).toHaveBeenCalledWith(
      "rl:203.0.113.9",
      60_000,
      "NX",
    );
    expect(pipeline.pttl).toHaveBeenCalledWith("rl:203.0.113.9");
    expect(pipeline.exec).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ current: 7, ttl: 45_000 });
  });

  it("garante expiração da chave nova em um único round-trip", async () => {
    const { pipeline, redis } = setupRedis();
    pipeline.exec.mockResolvedValue([[null, 1], [null, 1], [null, -1]]);

    const store = new RedisRateLimitStore({ timeWindow: 30_000 });
    const { error, result } = await incrAsync(store, "10.0.0.1", 5, -1);

    expect(error).toBeNull();
    expect(pipeline.exec).toHaveBeenCalledTimes(1);
    expect(redis.pexpire).toHaveBeenCalledWith("rl:10.0.0.1", 30_000);
    expect(result).toEqual({ current: 1, ttl: 30_000 });
  });

  it("isola o contador global do contador por rota via prefixo", async () => {
    const { pipeline } = setupRedis();
    pipeline.exec.mockResolvedValue([[null, 1], [null, 1], [null, 60_000]]);

    const global = new RedisRateLimitStore({ timeWindow: 60_000 });
    const route = global.child({
      routeInfo: { method: "POST", url: "/auth/login" },
      timeWindow: 300_000,
      max: 5,
    });

    await incrAsync(global, "198.51.100.7");
    await incrAsync(route, "198.51.100.7");

    expect(pipeline.incr).toHaveBeenNthCalledWith(1, "rl:198.51.100.7");
    expect(pipeline.incr).toHaveBeenNthCalledWith(
      2,
      "rl:POST:/auth/login:198.51.100.7",
    );
    expect(pipeline.pexpire).toHaveBeenNthCalledWith(
      2,
      "rl:POST:/auth/login:198.51.100.7",
      300_000,
      "NX",
    );
  });

  it("child preserva method/url diretos (compat com a API do plugin)", async () => {
    const { pipeline } = setupRedis();
    pipeline.exec.mockResolvedValue([[null, 2], [null, 1], [null, 60_000]]);

    const store = new RedisRateLimitStore();
    const child = store.child({ method: "GET", url: "/plans", timeWindow: 5_000 });

    await incrAsync(child, "192.0.2.1");

    expect(pipeline.incr).toHaveBeenCalledWith("rl:GET:/plans:192.0.2.1");
    expect(pipeline.pexpire).toHaveBeenCalledWith(
      "rl:GET:/plans:192.0.2.1",
      5_000,
      "NX",
    );
  });

  it("child sem rota mantém o prefixo do pai", async () => {
    const { pipeline } = setupRedis();
    pipeline.exec.mockResolvedValue([[null, 1], [null, 1], [null, 60_000]]);

    const store = new RedisRateLimitStore();
    const child = store.child({ timeWindow: 60_000, max: 100 });

    await incrAsync(child, "192.0.2.2");

    expect(pipeline.incr).toHaveBeenCalledWith("rl:192.0.2.2");
  });

  it("fail-closed por padrão: erro do Redis vira AppError 503", async () => {
    const { pipeline } = setupRedis();
    pipeline.exec.mockRejectedValue(new Error("ECONNREFUSED"));

    const store = new RedisRateLimitStore({ timeWindow: 60_000 });
    const { error, result } = await incrAsync(store, "203.0.113.1");

    expect(result).toBeUndefined();
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(503);
    expect((error as AppError).code).toBe("RATE_LIMIT_UNAVAILABLE");
  });

  it("fail-closed também quando a conexão falha de forma síncrona", async () => {
    setupRedis();
    getRedisConnectionMock.mockImplementation(() => {
      throw new Error("redis fechado");
    });

    const store = new RedisRateLimitStore();
    const { error } = await incrAsync(store, "203.0.113.2");

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(503);
  });

  it("onFailure allow mantém fail-open com TTL da janela", async () => {
    const { pipeline } = setupRedis();
    pipeline.exec.mockRejectedValue(new Error("ECONNREFUSED"));

    const store = new RedisRateLimitStore({
      timeWindow: 120_000,
      onFailure: "allow",
    });
    const { error, result } = await incrAsync(store, "203.0.113.3");

    expect(error).toBeNull();
    expect(result).toEqual({ current: 1, ttl: 120_000 });
  });

  it("child herda onFailure e aceita override por rota", async () => {
    const { pipeline } = setupRedis();
    pipeline.exec.mockRejectedValue(new Error("ECONNREFUSED"));

    const store = new RedisRateLimitStore({ onFailure: "reject" });

    const inherited = await incrAsync(store.child({ timeWindow: 60_000 }), "ip");
    expect((inherited.error as AppError).statusCode).toBe(503);

    const overridden = await incrAsync(
      store.child({ timeWindow: 60_000, onFailure: "allow" }),
      "ip",
    );
    expect(overridden.error).toBeNull();
    expect(overridden.result).toEqual({ current: 1, ttl: 60_000 });
  });

  it("read devolve TTL em milissegundos com prefixo aplicado", async () => {
    const { pipeline } = setupRedis();
    pipeline.exec.mockResolvedValue([[null, "12"], [null, 9_000]]);

    const store = new RedisRateLimitStore();
    const result = await new Promise<{
      error: Error | null;
      result?: RateLimitStoreResult;
    }>((resolve) => {
      store.read("203.0.113.4", (error, value) =>
        resolve({ error, result: value }),
      );
    });

    expect(result.error).toBeNull();
    expect(pipeline.get).toHaveBeenCalledWith("rl:203.0.113.4");
    expect(result.result).toEqual({ current: 12, ttl: 9_000 });
  });

  it("reset/remove usa a chave prefixada", async () => {
    const { redis } = setupRedis();

    const store = new RedisRateLimitStore();
    store.reset("203.0.113.5");

    expect(redis.del).toHaveBeenCalledWith("rl:203.0.113.5");
  });
});

describe("RedisRateLimitStore + @fastify/rate-limit", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
    vi.clearAllMocks();
  });

  async function buildApp(storeClass: unknown) {
    const instance = fastify({ logger: false });
    instance.setErrorHandler((error, _request, reply) => {
      const statusCode = (error as { statusCode?: number }).statusCode ?? 500;
      reply.code(statusCode).send({
        success: false,
        code: (error as { code?: string }).code,
        message: (error as Error).message,
      });
    });
    await instance.register(rateLimit, {
      max: 400,
      timeWindow: 60_000,
      store: storeClass as never,
    });
    instance.get(
      "/limited",
      { config: { rateLimit: { max: 2, timeWindow: 60_000 } } },
      async () => ({ ok: true }),
    );
    await instance.ready();
    return instance;
  }

  it("respeita a janela declarada e devolve 429 no limite", async () => {
    const { pipeline } = setupRedis();
    let count = 0;
    pipeline.exec.mockImplementation(async () => [
      [null, (count += 1)],
      [null, 1],
      [null, 59_000],
    ]);

    app = await buildApp(RedisRateLimitStore.withDefaults({ onFailure: "reject" }));

    const first = await app.inject({ method: "GET", url: "/limited" });
    const second = await app.inject({ method: "GET", url: "/limited" });
    const third = await app.inject({ method: "GET", url: "/limited" });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(third.statusCode).toBe(429);
    expect(pipeline.pexpire).toHaveBeenCalledWith(
      "rl:GET:/limited:127.0.0.1",
      60_000,
      "NX",
    );
  });

  it("Redis indisponível → 503 (fail-closed), nunca 200", async () => {
    const { pipeline } = setupRedis();
    pipeline.exec.mockRejectedValue(new Error("ECONNREFUSED"));

    app = await buildApp(RedisRateLimitStore.withDefaults({ onFailure: "reject" }));

    const response = await app.inject({ method: "GET", url: "/limited" });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      success: false,
      code: "RATE_LIMIT_UNAVAILABLE",
    });
  });

  it("onFailure allow mantém 200 com Redis indisponível", async () => {
    const { pipeline } = setupRedis();
    pipeline.exec.mockRejectedValue(new Error("ECONNREFUSED"));

    app = await buildApp(RedisRateLimitStore.withDefaults({ onFailure: "allow" }));

    const response = await app.inject({ method: "GET", url: "/limited" });

    expect(response.statusCode).toBe(200);
  });
});
