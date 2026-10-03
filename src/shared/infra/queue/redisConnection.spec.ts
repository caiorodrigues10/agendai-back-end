/// <reference types="vitest/globals" />

const state = vi.hoisted(() => ({
  created: [] as Array<{ url: string; options: Record<string, unknown> }>,
  quitCalls: 0,
  disconnectCalls: 0,
  hangQuit: false,
}));

vi.mock("ioredis", () => {
  class FakeRedis {
    constructor(url: string, options: Record<string, unknown>) {
      state.created.push({ url, options });
    }
    connect(): Promise<void> {
      return Promise.resolve();
    }
    on(): this {
      return this;
    }
    async get(): Promise<string | null> {
      return null;
    }
    quit(): Promise<void> {
      state.quitCalls += 1;
      if (state.hangQuit) return new Promise<never>(() => undefined);
      return Promise.resolve();
    }
    disconnect(): void {
      state.disconnectCalls += 1;
    }
  }
  return { default: FakeRedis };
});

async function load() {
  vi.resetModules();
  return await import("./redisConnection");
}

describe("redisConnection", () => {
  beforeEach(() => {
    state.created = [];
    state.quitCalls = 0;
    state.disconnectCalls = 0;
    state.hangQuit = false;
    vi.stubEnv("ALLOW_TEST_REDIS", "1");
    vi.stubEnv("REDIS_URL", "redis://localhost:6379");
    vi.stubEnv("REDIS_COMMAND_TIMEOUT_MS", "");
    vi.stubEnv("REDIS_CONNECT_TIMEOUT_MS", "");
    vi.stubEnv("REDIS_API_MAX_RETRIES_PER_REQUEST", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("mantém getRedisConnection() e o proxy apontando para a conexão de fila", async () => {
    const mod = await load();

    const queue = mod.getRedisConnection();

    expect(mod.getQueueRedisConnection()).toBe(queue);
    expect(state.created).toHaveLength(1);
    expect(await mod.redisConnection.get("chave")).toBe(null);
    expect(state.created).toHaveLength(1);
  });

  it("configura a conexão de fila para BullMQ", async () => {
    const mod = await load();
    mod.getRedisConnection();

    const options = state.created[0].options;
    expect(options.maxRetriesPerRequest).toBeNull();
    expect(options.enableOfflineQueue).not.toBe(false);
    expect(options.commandTimeout).toBeUndefined();
    expect(options.lazyConnect).toBe(true);
    expect(typeof options.retryStrategy).toBe("function");
  });

  it("configura a conexão da API para falha rápida", async () => {
    const mod = await load();
    const api = mod.getApiRedisConnection();

    expect(state.created).toHaveLength(1);

    const options = state.created[0].options;
    expect(options.maxRetriesPerRequest).toBe(1);
    expect(options.enableOfflineQueue).toBe(false);
    expect(options.commandTimeout).toBe(2_000);
    expect(options.connectTimeout).toBe(10_000);

    expect(api).not.toBe(mod.getRedisConnection());
    expect(state.created[1].options.maxRetriesPerRequest).toBeNull();
  });

  it("cria uma conexão dedicada de pub/sub", async () => {
    const mod = await load();
    const subscriber = mod.getSubscriberConnection();

    expect(subscriber).not.toBe(mod.getApiRedisConnection());
    expect(state.created).toHaveLength(2);
    expect(state.created[0].options.maxRetriesPerRequest).toBeNull();
  });

  it.each([
    ["REDIS_COMMAND_TIMEOUT_MS", "abc"],
    ["REDIS_COMMAND_TIMEOUT_MS", "NaN"],
    ["REDIS_CONNECT_TIMEOUT_MS", "0"],
    ["REDIS_API_MAX_RETRIES_PER_REQUEST", "-1"],
  ])("rejeita %s=%s", async (name, value) => {
    vi.stubEnv(name, value);
    const mod = await load();

    expect(() => mod.getApiRedisConnection()).toThrow(new RegExp(name));
  });

  it("não bloqueia a conexão de fila por timeout de comando inválido", async () => {
    vi.stubEnv("REDIS_COMMAND_TIMEOUT_MS", "abc");
    const mod = await load();

    expect(() => mod.getRedisConnection()).not.toThrow();
  });

  it("bloqueia o Redis em unit tests sem ALLOW_TEST_REDIS", async () => {
    vi.stubEnv("ALLOW_TEST_REDIS", "0");
    const mod = await load();

    expect(() => mod.getRedisConnection()).toThrow(/unit tests/);
    expect(() => mod.getApiRedisConnection()).toThrow(/unit tests/);
    expect(state.created).toHaveLength(0);
  });

  it("habilita TLS para rediss://", async () => {
    vi.stubEnv("REDIS_URL", "rediss://redis.example.com:6379");
    const mod = await load();
    mod.getRedisConnection();

    const options = state.created[0].options as {
      tls?: { rejectUnauthorized: boolean; servername: string };
    };
    expect(options.tls?.rejectUnauthorized).toBe(true);
    expect(options.tls?.servername).toBe("redis.example.com");
  });

  it("habilita TLS para upstash.io sem rediss://", async () => {
    vi.stubEnv("REDIS_URL", "redis://cache.upstash.io:6379");
    const mod = await load();
    mod.getApiRedisConnection();

    const options = state.created[0].options as {
      tls?: { rejectUnauthorized: boolean; servername: string };
    };
    expect(options.tls?.servername).toBe("cache.upstash.io");
  });

  it("não configura TLS para redis:// comum", async () => {
    const mod = await load();
    mod.getRedisConnection();

    expect(state.created[0].options.tls).toBeUndefined();
  });

  it("fecha todas as conexões e permite recriá-las", async () => {
    const mod = await load();
    mod.getRedisConnection();
    mod.getApiRedisConnection();

    await mod.closeRedisConnections();

    expect(state.quitCalls).toBe(2);
    expect(state.disconnectCalls).toBe(2);

    mod.getRedisConnection();
    expect(state.created).toHaveLength(3);
  });

  it("força o disconnect quando o quit não responde", async () => {
    vi.useFakeTimers();
    state.hangQuit = true;
    const mod = await load();
    mod.getRedisConnection();

    const closing = mod.closeRedisConnections();
    await vi.advanceTimersByTimeAsync(2_000);
    await closing;

    expect(state.quitCalls).toBe(1);
    expect(state.disconnectCalls).toBe(1);
    vi.useRealTimers();
  });

  it("não falha ao fechar sem conexões abertas", async () => {
    const mod = await load();

    await expect(mod.closeRedisConnections()).resolves.toBeUndefined();
    expect(state.quitCalls).toBe(0);
  });
});
export {};
