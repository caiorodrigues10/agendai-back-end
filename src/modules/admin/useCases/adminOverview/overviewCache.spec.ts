import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  overviewCache,
  readThrough,
  OVERVIEW_CACHE_TTL_MS,
  type CacheRedisClient,
} from "./overviewCache";

type FakeRedis = CacheRedisClient & {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
  store: Map<string, string>;
};

function fakeRedis(initial: Record<string, string> = {}): FakeRedis {
  const store = new Map(Object.entries(initial));
  const client = {
    status: "ready",
    store,
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
      return "OK";
    }),
    del: vi.fn(async (...keys: string[]) => {
      keys.forEach((key) => store.delete(key));
      return keys.length;
    }),
  };
  return client as unknown as FakeRedis;
}

function brokenRedis(): CacheRedisClient {
  return {
    status: "ready",
    get: async () => {
      throw new Error("redis down");
    },
    set: async () => {
      throw new Error("redis down");
    },
    del: async () => {
      throw new Error("redis down");
    },
  };
}

const KEY = "admin:overview:30d";

describe("overviewCache", () => {
  beforeEach(() => {
    overviewCache.__reset();
    overviewCache.__setRedisClient(null);
  });

  afterEach(() => {
    overviewCache.__reset();
    vi.useRealTimers();
  });

  it("miss: retorna null quando não há valor", async () => {
    expect(await overviewCache.get(KEY)).toBeNull();
  });

  it("hit: guarda e devolve o valor dentro do TTL", async () => {
    vi.useFakeTimers();
    await overviewCache.set(KEY, JSON.stringify({ value: 1 }));

    vi.advanceTimersByTime(OVERVIEW_CACHE_TTL_MS - 1_000);
    expect(await overviewCache.get(KEY)).toBe(JSON.stringify({ value: 1 }));
  });

  it("expira após o TTL e volta a ser miss", async () => {
    vi.useFakeTimers();
    const load = vi.fn(async () => ({ n: 1 }));

    await readThrough(KEY, load);
    await readThrough(KEY, load);
    expect(load).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(OVERVIEW_CACHE_TTL_MS + 1);
    await readThrough(KEY, load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("readThrough: hit não chama o loader de novo", async () => {
    const load = vi.fn(async () => ({ n: 1 }));

    const first = await readThrough(KEY, load);
    const second = await readThrough(KEY, load);

    expect(first).toEqual({ n: 1 });
    expect(second).toEqual({ n: 1 });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("fallback: Redis indisponível grava e lê na memória", async () => {
    overviewCache.__setRedisClient(brokenRedis());

    const load = vi.fn(async () => ({ n: 2 }));
    const first = await readThrough(KEY, load);
    const second = await readThrough(KEY, load);

    expect(first).toEqual({ n: 2 });
    expect(second).toEqual({ n: 2 });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("fallback: cliente Redis sem status 'ready' é ignorado", async () => {
    const reconnecting = fakeRedis();
    reconnecting.status = "reconnecting";
    overviewCache.__setRedisClient(reconnecting);

    await overviewCache.set(KEY, "mem-only");
    expect(reconnecting.get).not.toHaveBeenCalled();
    expect(await overviewCache.get(KEY)).toBe("mem-only");
  });

  it("lê do Redis quando o valor está lá e não está na memória", async () => {
    const redis = fakeRedis({ [KEY]: JSON.stringify({ fromRedis: true }) });
    overviewCache.__setRedisClient(redis);

    const load = vi.fn(async () => ({ fromRedis: false }));
    const value = await readThrough<{}>(KEY, load);

    expect(value).toEqual({ fromRedis: true });
    expect(load).not.toHaveBeenCalled();
    expect(redis.get).toHaveBeenCalledWith(KEY);
  });

  it("grava no Redis com TTL de 60s além da memória", async () => {
    const redis = fakeRedis();
    overviewCache.__setRedisClient(redis);

    await overviewCache.set(KEY, "payload");

    expect(redis.set).toHaveBeenCalledWith(KEY, "payload", "EX", 60);
    expect(redis.store.get(KEY)).toBe("payload");
  });

  it("clear remove memória e chaves conhecidas do Redis", async () => {
    const redis = fakeRedis();
    overviewCache.__setRedisClient(redis);
    await overviewCache.set(KEY, "payload");

    overviewCache.clear();

    expect(await overviewCache.get(KEY)).toBeNull();
    expect(redis.del).toHaveBeenCalledWith(KEY);
  });
});
