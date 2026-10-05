/// <reference types="vitest/globals" />

import type IORedis from "ioredis";

const mockAcquire = vi.fn();
const mockRenew = vi.fn();
const mockRelease = vi.fn();
const mockFindUnique = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockLoggerWarn = vi.fn();
const mockLoggerError = vi.fn();

vi.mock("./distributedLock", () => ({
  RedisDistributedLock: class {
    acquire = (...args: unknown[]) => mockAcquire(...args);
    renew = (...args: unknown[]) => mockRenew(...args);
    release = (...args: unknown[]) => mockRelease(...args);
  },
}));

vi.mock("@/libs/prismaClient", () => ({
  prisma: {
    cronRun: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  },
}));

vi.mock("@/shared/utils/logger", () => ({
  getModuleLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: (...args: unknown[]) => mockLoggerWarn(...args),
    error: (...args: unknown[]) => mockLoggerError(...args),
  })),
}));

import {
  spDateKey,
  spMinuteKey,
  spSlotKey,
  withCronLock,
} from "./cronLock";

const redis = {} as unknown as IORedis;
const LOCK_LOST = "Lock distribuído perdido durante a execução";

describe("withCronLock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAcquire.mockResolvedValue("owner-1");
    mockRenew.mockResolvedValue(true);
    mockRelease.mockResolvedValue(true);
    mockFindUnique.mockResolvedValue(null);
    mockCreate.mockResolvedValue({});
    mockUpdate.mockResolvedValue({});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("não executa nada quando outro processo detém o lock", async () => {
    mockAcquire.mockResolvedValue(null);
    const fn = vi.fn();

    await withCronLock(redis, { jobName: "job", scheduledKey: "k" }, fn);

    expect(fn).not.toHaveBeenCalled();
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("pula execuções já COMPLETED e libera o lock", async () => {
    mockFindUnique.mockResolvedValue({ id: "run-1", status: "COMPLETED" });
    const fn = vi.fn();

    await withCronLock(redis, { jobName: "job", scheduledKey: "k" }, fn);

    expect(fn).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockRelease).toHaveBeenCalledWith("cron:job:k", "owner-1");
  });

  it("pula RUNNING ainda dentro do lease para não sobrepor outra instância", async () => {
    mockFindUnique.mockResolvedValue({
      id: "run-1",
      status: "RUNNING",
      startedAt: new Date(Date.now() - 30_000),
    });
    const fn = vi.fn();

    await withCronLock(redis, { jobName: "job", scheduledKey: "k" }, fn);

    expect(fn).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("retoma RUNNING abandonado, reutiliza a linha e audita o motivo", async () => {
    const previousStartedAt = new Date(Date.now() - 20 * 60_000);
    mockFindUnique.mockResolvedValue({
      id: "run-1",
      status: "RUNNING",
      startedAt: previousStartedAt,
      error: null,
    });
    const fn = vi.fn().mockResolvedValue(undefined);

    await withCronLock(redis, { jobName: "job", scheduledKey: "k", staleAfterMs: 900_000 }, fn);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { id: "run-1" },
        data: expect.objectContaining({
          status: "RUNNING",
          startedAt: expect.any(Date),
          error: expect.stringContaining("RETOMADA"),
        }),
      })
    );
    expect(mockUpdate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ data: { status: "COMPLETED", completedAt: expect.any(Date) } })
    );
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ jobName: "job", scheduledKey: "k", resumeReason: "stale_running" }),
      expect.any(String)
    );
  });

  it("reexecuta uma run FAILED e limpa o erro anterior", async () => {
    mockFindUnique.mockResolvedValue({
      id: "run-1",
      status: "FAILED",
      startedAt: new Date(Date.now() - 60_000),
      error: "boom",
    });

    await withCronLock(redis, { jobName: "job", scheduledKey: "k" }, vi.fn());

    expect(mockUpdate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({ status: "RUNNING", error: null }),
      })
    );
  });

  it("registra FAILED e propaga o erro lançado pelo job", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("boom"));

    await expect(
      withCronLock(redis, { jobName: "job", scheduledKey: "k" }, fn)
    ).rejects.toThrow("boom");

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "FAILED", error: "boom" }),
      })
    );
    expect(mockRelease).toHaveBeenCalledWith("cron:job:k", "owner-1");
  });

  it("cria a linha quando não existe registro anterior", async () => {
    await withCronLock(redis, { jobName: "job", scheduledKey: "k" }, vi.fn());

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ jobName: "job", scheduledKey: "k", status: "RUNNING" }),
      })
    );
  });

  it("perda de renovação sinaliza o contexto e finaliza como FAILED", async () => {
    vi.useFakeTimers();
    mockRenew.mockResolvedValue(false);

    let heldDuringRun = true;
    const promise = withCronLock(
      redis,
      { jobName: "job", scheduledKey: "k", ttlMs: 10_000, renewIntervalMs: 50 },
      async (ctx) => {
        await vi.advanceTimersByTimeAsync(60);
        heldDuringRun = ctx.isLockHeld();
      }
    );

    await expect(promise).rejects.toThrow(LOCK_LOST);
    expect(heldDuringRun).toBe(false);
    expect(mockLoggerError).toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "FAILED", error: LOCK_LOST }),
      })
    );
    expect(mockRenew).toHaveBeenCalled();
  });

  it("falha transitória na renovação também bloqueia novos efeitos", async () => {
    vi.useFakeTimers();
    mockRenew.mockRejectedValue(new Error("redis down"));

    let heldDuringRun = true;
    const promise = withCronLock(
      redis,
      { jobName: "job", scheduledKey: "k", ttlMs: 10_000, renewIntervalMs: 50 },
      async (ctx) => {
        await vi.advanceTimersByTimeAsync(60);
        heldDuringRun = ctx.isLockHeld();
      }
    );

    await expect(promise).rejects.toThrow(LOCK_LOST);
    expect(heldDuringRun).toBe(false);
  });
});

describe("scheduledKey helpers", () => {
  it("spDateKey usa o fuso America/Sao_Paulo", () => {
    expect(spDateKey(new Date("2026-01-01T02:00:00Z"))).toBe("2025-12-31");
    expect(spDateKey(new Date("2026-01-01T04:00:00Z"))).toBe("2026-01-01");
  });

  it("spMinuteKey devolve YYYY-MM-DD-HH-mm", () => {
    expect(spMinuteKey(new Date("2026-01-01T02:07:00Z"))).toBe("2025-12-31-23-07");
  });

  it("spSlotKey arredonda para o slot do intervalo", () => {
    const date = new Date("2026-01-01T02:07:00Z");
    expect(spSlotKey(5, date)).toBe("2025-12-31-23-05");
    expect(spSlotKey(15, date)).toBe("2025-12-31-23-00");
  });
});
