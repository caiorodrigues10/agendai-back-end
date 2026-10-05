/// <reference types="vitest/globals" />

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  exists: vi.fn(),
  expire: vi.fn(),
  getApiRedisConnection: vi.fn(),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("@/shared/infra/queue/redisConnection", () => ({
  getApiRedisConnection: mocks.getApiRedisConnection,
}));

vi.mock("@/shared/utils/logger", () => ({
  getModuleLogger: () => mocks.logger,
}));

type Mod = typeof import("./subscriptionAccessCache");

async function load(): Promise<Mod> {
  vi.resetModules();
  return await import("./subscriptionAccessCache");
}

const REDIS_DOWN = new Error("ECONNREFUSED 127.0.0.1:6379");

function makeRedisDeaf(): void {
  mocks.get.mockRejectedValue(REDIS_DOWN);
  mocks.set.mockRejectedValue(REDIS_DOWN);
  mocks.del.mockRejectedValue(REDIS_DOWN);
  mocks.exists.mockRejectedValue(REDIS_DOWN);
  mocks.expire.mockRejectedValue(REDIS_DOWN);
}

describe("subscriptionAccessCache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.get.mockResolvedValue(null);
    mocks.set.mockResolvedValue("OK");
    mocks.del.mockResolvedValue(1);
    mocks.exists.mockResolvedValue(1);
    mocks.expire.mockResolvedValue(true);
    mocks.getApiRedisConnection.mockReturnValue({
      get: mocks.get,
      set: mocks.set,
      del: mocks.del,
      exists: mocks.exists,
      expire: mocks.expire,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("expõe TTLs inalterados", async () => {
    const mod = await load();
    expect(mod.SUBSCRIPTION_CACHE_TTL_SECONDS).toBe(300);
    expect(mod.SUBSCRIPTION_CACHE_TTL_MS).toBe(5 * 60 * 1000);
  });

  it("lê do Redis e normaliza o valor", async () => {
    const mod = await load();

    await expect(mod.getCachedAccess("shop-1")).resolves.toBeNull();

    mocks.get.mockResolvedValue("1");
    await expect(mod.getCachedAccess("shop-1")).resolves.toBe(true);

    mocks.get.mockResolvedValue("0");
    await expect(mod.getCachedAccess("shop-1")).resolves.toBe(false);

    expect(mocks.get).toHaveBeenCalledWith("subscription:access:shop-1");
  });

  it("grava com TTL de 5 minutos", async () => {
    const mod = await load();

    await mod.setCachedAccess("shop-1", true);

    expect(mocks.set).toHaveBeenCalledWith(
      "subscription:access:shop-1",
      "1",
      "EX",
      300,
    );
  });

  it("não propaga falha do Redis na leitura", async () => {
    const mod = await load();
    mocks.get.mockRejectedValue(REDIS_DOWN);

    await expect(mod.getCachedAccess("shop-1")).resolves.toBeNull();
    expect(mocks.logger.warn).toHaveBeenCalled();
  });

  it("não propaga falha do Redis na gravação", async () => {
    const mod = await load();
    mocks.set.mockRejectedValue(REDIS_DOWN);

    await expect(mod.setCachedAccess("shop-1", false)).resolves.toBeUndefined();
    expect(mocks.logger.warn).toHaveBeenCalled();
  });

  it("não propaga falha do Redis na invalidação e no refresh", async () => {
    const mod = await load();
    mocks.del.mockRejectedValue(REDIS_DOWN);
    mocks.exists.mockRejectedValue(REDIS_DOWN);

    await expect(mod.invalidateSubscriptionCache("shop-1")).resolves.toBeUndefined();
    await expect(mod.refreshSubscriptionCache("shop-1")).resolves.toBeUndefined();
  });

  it("não lança quando nem a conexão é obtida", async () => {
    const mod = await load();
    mocks.getApiRedisConnection.mockImplementation(() => {
      throw new Error("Stream isn't writeable and initialBufferSize exceeded");
    });

    await expect(mod.getCachedAccess("shop-1")).resolves.toBeNull();
    await expect(mod.setCachedAccess("shop-1", true)).resolves.toBeUndefined();
    await expect(mod.invalidateSubscriptionCache("shop-1")).resolves.toBeUndefined();
    await expect(mod.refreshSubscriptionCache("shop-1")).resolves.toBeUndefined();
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("concede apenas o que o banco decidiu quando está degradado", async () => {
    const mod = await load();
    makeRedisDeaf();

    await expect(mod.getCachedAccess("shop-1")).resolves.toBeNull();
    await mod.setCachedAccess("shop-1", false);
    await expect(mod.getCachedAccess("shop-1")).resolves.toBe(false);
  });

  it("limita leituras concorrentes a uma por salão", async () => {
    const mod = await load();
    makeRedisDeaf();

    const primeiro = await mod.getCachedAccess("shop-1");
    expect(primeiro).toBeNull();

    const segundo = mod.getCachedAccess("shop-1");
    const terceiro = mod.getCachedAccess("shop-1");

    await mod.setCachedAccess("shop-1", true);

    await expect(segundo).resolves.toBe(true);
    await expect(terceiro).resolves.toBe(true);
    await expect(mod.getCachedAccess("shop-1")).resolves.toBe(true);
  });

  it("invalidação limpa também o cache local", async () => {
    const mod = await load();
    makeRedisDeaf();

    await mod.setCachedAccess("shop-1", true);
    await expect(mod.getCachedAccess("shop-1")).resolves.toBe(true);

    await mod.invalidateSubscriptionCache("shop-1");

    await expect(mod.getCachedAccess("shop-1")).resolves.toBeNull();
  });

  it("refresh prorroga a validade do cache local", async () => {
    const mod = await load();
    makeRedisDeaf();

    await mod.setCachedAccess("shop-1", true);
    await mod.refreshSubscriptionCache("shop-1");

    await expect(mod.getCachedAccess("shop-1")).resolves.toBe(true);
  });

  it("cache local expira", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    const mod = await load();
    makeRedisDeaf();

    await mod.setCachedAccess("shop-1", true);
    await expect(mod.getCachedAccess("shop-1")).resolves.toBe(true);

    vi.setSystemTime(new Date("2026-01-01T00:06:00Z"));
    await expect(mod.getCachedAccess("shop-1")).resolves.toBeNull();
  });

  it("volta ao Redis quando ele volta", async () => {
    const mod = await load();
    makeRedisDeaf();
    await mod.getCachedAccess("shop-1");
    expect(mocks.logger.warn).toHaveBeenCalledTimes(1);

    mocks.get.mockResolvedValue("1");
    mocks.set.mockResolvedValue("OK");

    await expect(mod.getCachedAccess("shop-1")).resolves.toBe(true);
    expect(mocks.logger.info).toHaveBeenCalled();
    expect(mocks.logger.warn).toHaveBeenCalledTimes(1);
  });
});
export {};
