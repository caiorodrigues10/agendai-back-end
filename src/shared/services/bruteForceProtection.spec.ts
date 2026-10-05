/// <reference types="vitest/globals" />

// Forçar NODE_ENV=production para testar thresholds de produção
vi.stubEnv("NODE_ENV", "production");

const redisStore = new Map<string, { value: string; ttl: number }>();

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

function createMockRedis() {
  return {
    incr: vi.fn(async (key: string) => {
      const entry = redisStore.get(key);
      const count = (entry ? parseInt(entry.value, 10) : 0) + 1;
      redisStore.set(key, { value: String(count), ttl: entry?.ttl ?? 300 });
      return count;
    }),
    set: vi.fn(async (key: string, value: string, ...args: unknown[]) => {
      let ttl = 300;
      for (let i = 0; i < args.length; i++) {
        if (args[i] === "EX" && typeof args[i + 1] === "number") {
          ttl = args[i + 1] as number;
        }
      }
      redisStore.set(key, { value, ttl });
      return "OK";
    }),
    expire: vi.fn(async (key: string, seconds: number) => {
      const entry = redisStore.get(key);
      if (entry) entry.ttl = seconds;
      return entry ? 1 : 0;
    }),
    ttl: vi.fn(async (key: string) => {
      const entry = redisStore.get(key);
      return entry ? entry.ttl : -2;
    }),
    del: vi.fn(async (key: string) => {
      redisStore.delete(key);
      return 1;
    }),
    scan: vi.fn(
      async (cursor: string, _match: string, pattern: string) => {
        if (cursor !== "0") return ["0", [] as string[]];
        const matcher = globToRegExp(pattern);
        return ["0", [...redisStore.keys()].filter((key) => matcher.test(key))];
      }
    ),
    pipeline: vi.fn(function (this: ReturnType<typeof createMockRedis>) {
      const cmds: { method: string; args: unknown[] }[] = [];
      const pipelineApi = {
        set: (...args: unknown[]) => {
          cmds.push({ method: "set", args });
          return pipelineApi;
        },
        expire: (...args: unknown[]) => {
          cmds.push({ method: "expire", args });
          return pipelineApi;
        },
        del: (...args: unknown[]) => {
          cmds.push({ method: "del", args });
          return pipelineApi;
        },
        exec: async () => {
          for (const cmd of cmds) {
            if (cmd.method === "set") {
              await this.set(cmd.args[0] as string, cmd.args[1] as string, ...cmd.args.slice(2));
            } else if (cmd.method === "expire") {
              await this.expire(cmd.args[0] as string, cmd.args[1] as number);
            } else if (cmd.method === "del") {
              await this.del(cmd.args[0] as string);
            }
          }
          return cmds.map(() => [null, 1]);
        },
      };
      return pipelineApi;
    }),
  };
}

const mockRedis = createMockRedis();

vi.mock("@/shared/infra/queue/redisConnection", () => ({
  getApiRedisConnection: () => mockRedis,
}));

vi.mock("@/shared/utils/logger", () => ({
  getModuleLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe("bruteForceProtection", () => {
  let checkLock: typeof import("./bruteForceProtection").checkLock;
  let recordFailure: typeof import("./bruteForceProtection").recordFailure;
  let resetAttempts: typeof import("./bruteForceProtection").resetAttempts;
  let resetByEmail: typeof import("./bruteForceProtection").resetByEmail;
  let resetByIp: typeof import("./bruteForceProtection").resetByIp;
  let cleanupTimers: typeof import("./bruteForceProtection").cleanupTimers;

  beforeEach(async () => {
    redisStore.clear();
    vi.useFakeTimers();
    vi.resetModules();
    const mod = await import("./bruteForceProtection");
    checkLock = mod.checkLock;
    recordFailure = mod.recordFailure;
    resetAttempts = mod.resetAttempts;
    resetByEmail = mod.resetByEmail;
    resetByIp = mod.resetByIp;
    cleanupTimers = mod.cleanupTimers;
  });

  afterEach(() => {
    cleanupTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe("checkLock", () => {
    it("returns locked: false when no lock exists", async () => {
      const result = await checkLock("user@test.com", "1.2.3.4");
      expect(result.locked).toBe(false);
      expect(result.retryAfterSeconds).toBeUndefined();
    });

    it("returns locked: true with TTL when email is locked", async () => {
      redisStore.set("login:locked:user@test.com", { value: "1", ttl: 120 });
      const result = await checkLock("user@test.com", "1.2.3.4");
      expect(result.locked).toBe(true);
      expect(result.retryAfterSeconds).toBe(120);
    });
  });

  describe("recordFailure", () => {
    it("increments attempt counter", async () => {
      await recordFailure("user@test.com", "1.2.3.4");
      expect(redisStore.get("login:attempts:user@test.com:1.2.3.4")?.value).toBe("1");
    });

    it("locks at 5 failures with 60s TTL", async () => {
      for (let i = 0; i < 5; i++) {
        await recordFailure("user@test.com", "1.2.3.4");
      }
      const lock = redisStore.get("login:locked:user@test.com");
      expect(lock).toBeDefined();
      expect(lock!.ttl).toBe(60);
    });

    it("locks at 10 failures with 300s TTL", async () => {
      for (let i = 0; i < 10; i++) {
        await recordFailure("user@test.com", "1.2.3.4");
      }
      const lock = redisStore.get("login:locked:user@test.com");
      expect(lock).toBeDefined();
      expect(lock!.ttl).toBe(300);
    });

    it("locks at 15 failures with 900s TTL", async () => {
      for (let i = 0; i < 15; i++) {
        await recordFailure("user@test.com", "1.2.3.4");
      }
      const lock = redisStore.get("login:locked:user@test.com");
      expect(lock).toBeDefined();
      expect(lock!.ttl).toBe(900);
    });

    it("locks at 20 failures with 1800s TTL", async () => {
      for (let i = 0; i < 20; i++) {
        await recordFailure("user@test.com", "1.2.3.4");
      }
      const lock = redisStore.get("login:locked:user@test.com");
      expect(lock).toBeDefined();
      expect(lock!.ttl).toBe(1800);
    });

    it("returns locked: false for sub-threshold attempts", async () => {
      const result = await recordFailure("user@test.com", "1.2.3.4");
      expect(result.locked).toBe(false);
      expect(result.retryAfterSeconds).toBe(0);
    });

    it("returns locked: true at threshold", async () => {
      for (let i = 0; i < 4; i++) {
        await recordFailure("user@test.com", "1.2.3.4");
      }
      const result = await recordFailure("user@test.com", "1.2.3.4");
      expect(result.locked).toBe(true);
      expect(result.retryAfterSeconds).toBe(60);
    });
  });

  describe("resetAttempts", () => {
    it("clears attempts and lock keys", async () => {
      await recordFailure("user@test.com", "1.2.3.4");
      await recordFailure("user@test.com", "1.2.3.4");
      expect(redisStore.has("login:attempts:user@test.com:1.2.3.4")).toBe(true);

      await resetAttempts("user@test.com", "1.2.3.4");
      expect(redisStore.has("login:attempts:user@test.com:1.2.3.4")).toBe(false);
      expect(redisStore.has("login:locked:user@test.com")).toBe(false);
    });

    it("clears the lock timer from the Map", async () => {
      for (let i = 0; i < 5; i++) {
        await recordFailure("user@test.com", "1.2.3.4");
      }
      await resetAttempts("user@test.com", "1.2.3.4");
      await expect(checkLock("user@test.com", "1.2.3.4")).resolves.toEqual({ locked: false });
    });
  });

  describe("resetByEmail", () => {
    it("remove contadores e lock do email via SCAN", async () => {
      await recordFailure("a@test.com", "1.1.1.1");
      await recordFailure("a@test.com", "2.2.2.2");
      await recordFailure("b@test.com", "1.1.1.1");
      redisStore.set("login:locked:a@test.com", { value: "1", ttl: 60 });

      await resetByEmail("a@test.com");

      expect(redisStore.has("login:attempts:a@test.com:1.1.1.1")).toBe(false);
      expect(redisStore.has("login:attempts:a@test.com:2.2.2.2")).toBe(false);
      expect(redisStore.has("login:locked:a@test.com")).toBe(false);
      expect(redisStore.has("login:attempts:b@test.com:1.1.1.1")).toBe(true);
      expect(mockRedis.scan).toHaveBeenCalled();
      expect((mockRedis as { keys?: unknown }).keys).toBeUndefined();
    });
  });

  describe("resetByIp", () => {
    it("remove contadores do ip e os locks dos emails afetados", async () => {
      await recordFailure("a@test.com", "9.9.9.9");
      await recordFailure("b@test.com", "9.9.9.9");
      await recordFailure("c@test.com", "8.8.8.8");
      redisStore.set("login:locked:a@test.com", { value: "1", ttl: 60 });

      await resetByIp("9.9.9.9");

      expect(redisStore.has("login:attempts:a@test.com:9.9.9.9")).toBe(false);
      expect(redisStore.has("login:attempts:b@test.com:9.9.9.9")).toBe(false);
      expect(redisStore.has("login:locked:a@test.com")).toBe(false);
      expect(redisStore.has("login:attempts:c@test.com:8.8.8.8")).toBe(true);
      expect(mockRedis.scan).toHaveBeenCalled();
    });

    it("preserva a semântica de reset quando o SCAN não encontra nada", async () => {
      await resetByIp("7.7.7.7");

      expect(mockRedis.scan).toHaveBeenCalledWith(
        "0",
        "MATCH",
        "login:attempts:*:7.7.7.7",
        "COUNT",
        expect.any(Number),
      );
    });
  });

  describe("cleanupTimers", () => {
    it("clears all timers without errors", async () => {
      for (let i = 0; i < 5; i++) {
        await recordFailure("user@test.com", "1.2.3.4");
      }
      cleanupTimers();
    });
  });

  describe("graceful Redis failure", () => {
    it("checkLock allows login when Redis throws", async () => {
      const origIncr = mockRedis.ttl;
      mockRedis.ttl = vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      });
      const result = await checkLock("user@test.com", "1.2.3.4");
      expect(result.locked).toBe(false);
      mockRedis.ttl = origIncr;
    });

    it("recordFailure allows login when Redis throws", async () => {
      const origIncr = mockRedis.incr;
      mockRedis.incr = vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      });
      const result = await recordFailure("user@test.com", "1.2.3.4");
      expect(result.locked).toBe(false);
      mockRedis.incr = origIncr;
    });

    it("resetAttempts does not throw when Redis throws", async () => {
      const origDel = mockRedis.del;
      mockRedis.del = vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      });
      await expect(
        resetAttempts("user@test.com", "1.2.3.4"),
      ).resolves.toBeUndefined();
      mockRedis.del = origDel;
    });
  });
});
export {};
