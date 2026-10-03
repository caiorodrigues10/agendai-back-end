/// <reference types="vitest/globals" />

const mockOutboxFindMany = vi.fn();
const mockOutboxUpdate = vi.fn();
const mockOutboxUpdateMany = vi.fn();
const mockDeliveryUpdateMany = vi.fn();
const mockTransaction = vi.fn();
const mockQueueAdd = vi.fn();

vi.mock("@/libs/prismaClient", () => ({
  prisma: {
    notificationOutbox: {
      findMany: (...args: unknown[]) => mockOutboxFindMany(...args),
      update: (...args: unknown[]) => mockOutboxUpdate(...args),
      updateMany: (...args: unknown[]) => mockOutboxUpdateMany(...args),
    },
    notificationDelivery: {
      updateMany: (...args: unknown[]) => mockDeliveryUpdateMany(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

vi.mock("./notificationQueue", () => ({
  getNotificationQueue: () => ({ add: (...args: unknown[]) => mockQueueAdd(...args) }),
}));

import {
  dispatchNotificationOutboxNow,
  startNotificationDispatcher,
  stopNotificationDispatcher,
} from "./notificationDispatcher";

const MIN_INTERVAL_MS = 500;
const MAX_INTERVAL_MS = 30_000;
const JITTERED_MIN = Math.round(MIN_INTERVAL_MS * 1.15);

function candidate(id: string) {
  return { id, deliveryId: `d-${id}`, publishAttempts: 0, delivery: { status: "PENDING" } };
}

describe("notificationDispatcher", () => {
  let delays: number[] = [];
  let restoreCapture: (() => void) | null = null;

  function captureDelays() {
    const original = globalThis.setTimeout;
    delays = [];
    globalThis.setTimeout = ((fn: (...args: unknown[]) => void, ms?: number, ...args: unknown[]) => {
      if (typeof ms === "number") delays.push(ms);
      return original(fn, ms, ...args);
    }) as typeof setTimeout;
    restoreCapture = () => {
      globalThis.setTimeout = original;
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.stubEnv("VITEST", "");
    vi.stubEnv("NOTIFICATION_V2_MODE", "active");
    mockOutboxFindMany.mockResolvedValue([]);
    mockOutboxUpdate.mockResolvedValue({});
    mockOutboxUpdateMany.mockResolvedValue({ count: 1 });
    mockDeliveryUpdateMany.mockResolvedValue({ count: 1 });
    mockTransaction.mockResolvedValue([]);
    mockQueueAdd.mockResolvedValue({});
  });

  afterEach(async () => {
    await stopNotificationDispatcher();
    restoreCapture?.();
    restoreCapture = null;
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("intervalo curto quando há trabalho e crescimento gradual quando ocioso", async () => {
    captureDelays();
    mockOutboxFindMany.mockResolvedValue([candidate("o1")]);

    await startNotificationDispatcher();
    expect(mockQueueAdd).toHaveBeenCalled();
    expect(delays[0]).toBeGreaterThanOrEqual(MIN_INTERVAL_MS);
    expect(delays[0]).toBeLessThanOrEqual(JITTERED_MIN);

    await vi.advanceTimersByTimeAsync(delays[0]);
    expect(delays[1]).toBeGreaterThanOrEqual(MIN_INTERVAL_MS);
    expect(delays[1]).toBeLessThanOrEqual(JITTERED_MIN);
  });

  it("sem trabalho o intervalo cresce até o teto de 30s", async () => {
    captureDelays();

    await startNotificationDispatcher();
    for (let i = 0; i < 14; i++) {
      await vi.advanceTimersByTimeAsync(delays[delays.length - 1]);
    }

    expect(delays.length).toBeGreaterThanOrEqual(15);
    expect(Math.min(...delays)).toBeGreaterThanOrEqual(MIN_INTERVAL_MS);
    expect(Math.max(...delays)).toBeLessThanOrEqual(MAX_INTERVAL_MS);
    expect(delays[delays.length - 1]).toBeGreaterThan(delays[0] * 5);
    expect(delays[delays.length - 1]).toBeGreaterThanOrEqual(MAX_INTERVAL_MS * 0.85 - 1);
  });

  it("lote cheio mantém o intervalo curto mesmo sem publicação bem-sucedida", async () => {
    captureDelays();
    mockOutboxFindMany.mockResolvedValue(Array.from({ length: 25 }, (_, i) => candidate(`o${i}`)));
    mockOutboxUpdateMany.mockResolvedValue({ count: 0 });

    await startNotificationDispatcher();

    expect(mockOutboxFindMany).toHaveBeenCalledTimes(1);
    expect(delays[0]).toBeGreaterThanOrEqual(MIN_INTERVAL_MS);
    expect(delays[0]).toBeLessThanOrEqual(JITTERED_MIN);
  });

  it("aplica jitter entre instâncias", async () => {
    captureDelays();
    vi.spyOn(Math, "random").mockReturnValue(0.9);
    mockOutboxFindMany.mockResolvedValue([candidate("o1")]);

    await startNotificationDispatcher();

    expect(delays[0]).toBe(560);
  });

  it("crescimento e jitter respeitam o teto máximo", async () => {
    captureDelays();
    vi.spyOn(Math, "random").mockReturnValue(0.99);

    await startNotificationDispatcher();
    for (let i = 0; i < 20; i++) {
      await vi.advanceTimersByTimeAsync(delays[delays.length - 1]);
    }

    expect(Math.max(...delays)).toBe(MAX_INTERVAL_MS);
  });

  it("backoff de nova tentativa continua em min(5min, 2000*2^attempts)", async () => {
    vi.setSystemTime(new Date("2026-09-29T12:00:00.000Z"));
    mockOutboxFindMany.mockResolvedValue([candidate("o1")]);
    mockQueueAdd.mockRejectedValue(new Error("redis down"));

    await dispatchNotificationOutboxNow();

    const failedCall = mockOutboxUpdate.mock.calls.find(
      (call) => (call[0] as { data?: { status?: string } })?.data?.status === "FAILED"
    );
    expect(failedCall).toBeDefined();
    const data = (failedCall as unknown[])[0] as { data: { nextAttemptAt: Date; lastError: string | null } };
    expect(data.data.nextAttemptAt.getTime()).toBe(Date.parse("2026-09-29T12:00:00.000Z") + 4_000);
    expect(data.data.lastError).toBe("redis down");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("dispatchNotificationOutboxNow não agenda novos timers", async () => {
    mockOutboxFindMany.mockResolvedValue([candidate("o1")]);

    await dispatchNotificationOutboxNow();

    expect(mockQueueAdd).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("não inicia quando o modo V2 não está ativo", async () => {
    vi.stubEnv("NOTIFICATION_V2_MODE", "disabled");

    await startNotificationDispatcher();

    expect(mockOutboxFindMany).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stop cancela novos ticks", async () => {
    captureDelays();
    await startNotificationDispatcher();
    const before = mockOutboxFindMany.mock.calls.length;

    await vi.advanceTimersByTimeAsync(delays[0]);
    expect(mockOutboxFindMany.mock.calls.length).toBeGreaterThan(before);

    const restore = restoreCapture;
    restoreCapture = null;
    restore?.();
    await stopNotificationDispatcher();
    const afterStop = mockOutboxFindMany.mock.calls.length;

    await vi.advanceTimersByTimeAsync(MAX_INTERVAL_MS * 3);
    expect(mockOutboxFindMany.mock.calls.length).toBe(afterStop);
  });
});
