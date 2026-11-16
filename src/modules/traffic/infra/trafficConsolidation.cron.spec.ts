/// <reference types="vitest/globals" />

const cronSchedule = vi.fn();
const withCronLock = vi.fn();
const execute = vi.fn(async (day: string) => ({ day }));

async function loadCron() {
  vi.resetModules();
  cronSchedule.mockReset();
  withCronLock.mockReset();
  execute.mockClear();

  vi.doMock("node-cron", () => ({
    default: { schedule: cronSchedule },
  }));
  vi.doMock("@/shared/utils/correlationContext", () => ({
    withCronCorrelation: (_name: string, fn: () => Promise<void>) => fn,
  }));
  vi.doMock("@/shared/infra/queue/redisConnection", () => ({
    getRedisConnection: () => ({ kind: "redis" }),
  }));
  vi.doMock("@/shared/infra/redis/cronLock", () => ({
    spSlotKey: (_interval: number, _now: Date) => "2026-11-15-12-00",
    withCronLock,
  }));
  vi.doMock("tsyringe", async (importOriginal) => {
    const actual = await importOriginal<typeof import("tsyringe")>();
    return {
      ...actual,
      container: { resolve: () => ({ execute }) },
    };
  });

  return import("./trafficConsolidation.cron");
}

describe("cron de consolidação de tráfego", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-15T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("é agendado no horário de São Paulo e executa sob withCronLock", async () => {
    const { scheduleTrafficConsolidation } = await loadCron();
    withCronLock.mockImplementation(
      async (_redis: unknown, _options: unknown, fn: () => Promise<void>) => {
        await fn();
      },
    );
    const info = vi.fn();
    const error = vi.fn();

    scheduleTrafficConsolidation({ info, error });

    expect(cronSchedule).toHaveBeenCalledTimes(1);
    expect(cronSchedule).toHaveBeenCalledWith(
      "5 * * * *",
      expect.any(Function),
      { timezone: "America/Sao_Paulo" },
    );
    const scheduledCallback = cronSchedule.mock.calls[0][1] as () => Promise<void>;
    await scheduledCallback();

    expect(withCronLock).toHaveBeenCalledTimes(1);
    expect(withCronLock).toHaveBeenCalledWith(
      { kind: "redis" },
      {
        jobName: "traffic-consolidation",
        scheduledKey: "2026-11-15-12-00",
      },
      expect.any(Function),
    );
    expect(execute).toHaveBeenNthCalledWith(1, "2026-11-14");
    expect(execute).toHaveBeenNthCalledWith(2, "2026-11-15");
    expect(error).not.toHaveBeenCalled();
  });
});
