import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const redisStore = new Map<string, { value: string; ttl: number }>();

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
  getRedisConnection: () => mockRedis,
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
  let cleanupTimers: typeof import("./bruteForceProtection").cleanupTimers;

  beforeEach(async () => {
    redisStore.clear();
    vi.useFakeTimers();
    vi.resetModules();
    const mod = await import("./bruteForceProtection");
    checkLock = mod.checkLock;
    recordFailure = mod.recordFailure;
    resetAttempts = mod.resetAttempts;
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
