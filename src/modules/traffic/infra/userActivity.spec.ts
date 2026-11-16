/// <reference types="vitest/globals" />
import { userActivityDedupeKey } from "./trafficKeys";

const USER_ID = "44444444-4444-4444-8444-444444444444";
const NOW = new Date("2026-11-15T12:00:00.000Z");
const DAY = "2026-11-15";

const redisSet = vi.fn();
const redisDel = vi.fn();
const activityUpsert = vi.fn();
const loggerWarn = vi.fn();

async function loadRecorder(): Promise<typeof import("./userActivity").recordUserActivity> {
  vi.resetModules();
  redisSet.mockReset();
  redisDel.mockReset();
  activityUpsert.mockReset();
  loggerWarn.mockReset();

  vi.doMock("@/shared/infra/queue/redisConnection", () => ({
    getApiRedisConnection: () => ({
      set: redisSet,
      del: redisDel,
    }),
  }));
  vi.doMock("@/libs/prismaClient", () => ({
    prisma: {
      userActivityDaily: {
        upsert: activityUpsert,
      },
    },
  }));
  vi.doMock("@/shared/utils/logger", () => ({
    getModuleLogger: () => ({
      warn: loggerWarn,
    }),
  }));

  const module = await import("./userActivity");
  return module.recordUserActivity;
}

describe("atividade diária de usuário é best-effort", () => {
  it.each([
    {
      label: "permission denied",
      error: Object.assign(new Error("permission denied for table user_activity_daily"), {
        code: "P2010",
      }),
    },
    {
      label: "PostgreSQL indisponível",
      error: Object.assign(new Error("database connection failed"), {
        name: "PrismaClientInitializationError",
      }),
    },
  ])(
    "não propaga falha do PostgreSQL ($label), registra sem PII e permite retry",
    async ({ error }) => {
      const recordUserActivity = await loadRecorder();
      redisSet.mockResolvedValue("OK");
      redisDel.mockResolvedValue(1);
      activityUpsert.mockRejectedValue(error);

      await expect(recordUserActivity(USER_ID, NOW)).resolves.toBeUndefined();

      expect(activityUpsert).toHaveBeenCalledTimes(1);
      expect(redisDel).toHaveBeenCalledWith(userActivityDedupeKey(DAY, USER_ID));
      expect(loggerWarn).toHaveBeenCalledTimes(1);
      expect(loggerWarn).toHaveBeenCalledWith(
        expect.objectContaining({
          dependency: "postgres",
          errorType: error.name,
          errorCode: "code" in error ? error.code : undefined,
        }),
        "failed to record daily user activity",
      );

      const logged = JSON.stringify(loggerWarn.mock.calls);
      expect(logged).not.toContain(USER_ID);
      expect(logged).not.toContain("owner@example.test");
      expect(logged).not.toContain("203.0.113.10");
      expect(logged).not.toContain("Bearer secret");
      expect(logged).not.toContain(error.message);
    },
  );

  it("não propaga falha do Redis, registra sem PII e não tenta gravar no PostgreSQL", async () => {
    const recordUserActivity = await loadRecorder();
    const redisError = Object.assign(new Error("connect ECONNREFUSED 10.0.0.10:6379"), {
      name: "ConnectionError",
    });
    redisSet.mockRejectedValue(redisError);
    redisDel.mockRejectedValue(redisError);

    await expect(recordUserActivity(USER_ID, NOW)).resolves.toBeUndefined();

    expect(activityUpsert).not.toHaveBeenCalled();
    expect(loggerWarn).toHaveBeenCalledTimes(1);
    expect(loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        dependency: "redis",
        errorType: "ConnectionError",
      }),
      "failed to record daily user activity",
    );

    const logged = JSON.stringify(loggerWarn.mock.calls);
    expect(logged).not.toContain(USER_ID);
    expect(logged).not.toContain("owner@example.test");
    expect(logged).not.toContain("203.0.113.10");
    expect(logged).not.toContain("Bearer secret");
    expect(logged).not.toContain(redisError.message);
  });

  it("não regrava uma linha já existente no mesmo dia", async () => {
    const recordUserActivity = await loadRecorder();
    redisSet.mockResolvedValue("OK");
    activityUpsert.mockResolvedValue({});

    await recordUserActivity(USER_ID, NOW);

    expect(activityUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          day_userId: {
            day: new Date(`${DAY}T00:00:00.000Z`),
            userId: USER_ID,
          },
        },
        update: {},
      }),
    );
  });
});
