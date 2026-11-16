/// <reference types="vitest/globals" />

const USER_ID = "55555555-5555-4555-8555-555555555555";

type ActivityFailure =
  | "postgres-permission-denied"
  | "postgres-unavailable"
  | "redis";

async function loadController(failure: ActivityFailure) {
  vi.resetModules();

  const activityRedisSet = vi.fn();
  const activityRedisDel = vi.fn();
  const activityUpsert = vi.fn();
  const activityLoggerWarn = vi.fn();

  if (
    failure === "postgres-permission-denied" ||
    failure === "postgres-unavailable"
  ) {
    activityRedisSet.mockResolvedValue("OK");
    activityRedisDel.mockResolvedValue(1);
    const postgresError =
      failure === "postgres-permission-denied"
        ? Object.assign(
            new Error("permission denied for table user_activity_daily"),
            { code: "P2010" },
          )
        : Object.assign(new Error("database connection failed"), {
            name: "PrismaClientInitializationError",
            code: "P1001",
          });
    activityUpsert.mockRejectedValue(postgresError);
  } else {
    const redisError = Object.assign(new Error("Redis unavailable"), {
      name: "ConnectionError",
    });
    activityRedisSet.mockRejectedValue(redisError);
    activityRedisDel.mockRejectedValue(redisError);
  }

  vi.doMock("@/shared/infra/queue/redisConnection", () => ({
    getApiRedisConnection: () => ({
      set: activityRedisSet,
      del: activityRedisDel,
    }),
  }));
  vi.doMock("@/libs/prismaClient", () => ({
    prisma: { userActivityDaily: { upsert: activityUpsert } },
  }));
  vi.doMock("@/shared/utils/logger", () => ({
    getModuleLogger: () => ({ warn: activityLoggerWarn }),
  }));
  vi.doMock("@/shared/services/accessLogService", () => ({
    logAccess: vi.fn().mockResolvedValue(undefined),
  }));
  vi.doMock("./GoogleLoginUseCase", () => ({
    GoogleLoginUseCase: class {},
  }));
  vi.doMock("tsyringe", () => ({
    container: {
      resolve: () => ({
        execute: vi.fn(async () => ({
          user: { id: USER_ID },
          accessToken: "google-access-token",
        })),
      }),
    },
  }));

  const { GoogleLoginController } = await import("./GoogleLoginController");
  return {
    controller: new GoogleLoginController(),
    activity: {
      redisSet: activityRedisSet,
      redisDel: activityRedisDel,
      upsert: activityUpsert,
      loggerWarn: activityLoggerWarn,
    },
  };
}

function replyCapture() {
  const state: { statusCode?: number; body?: unknown } = {};
  const reply = {
    status(code: number) {
      state.statusCode = code;
      return reply;
    },
    send(body: unknown) {
      state.body = body;
      return reply;
    },
  };
  return { reply, state };
}

describe("GoogleLoginController — resiliência da atividade diária", () => {
  it.each([
    "postgres-permission-denied",
    "postgres-unavailable",
    "redis",
  ] as const)(
    "mantém o login Google concluído quando a atividade falha no %s",
    async (failure) => {
      const { controller, activity } = await loadController(failure);
      const { reply, state } = replyCapture();

      await controller.handle(
        {
          body: { idToken: "google-id-token" },
          ip: "203.0.113.51",
          headers: { "user-agent": "test-browser" },
          log: { error: vi.fn(), warn: vi.fn() },
        } as any,
        reply as any,
      );

      expect(state.statusCode).toBe(200);
      expect(state.body).toMatchObject({ accessToken: "google-access-token" });
      expect(activity.loggerWarn).toHaveBeenCalledTimes(1);
      expect(activity.loggerWarn).toHaveBeenCalledWith(
        expect.objectContaining({
          dependency: failure === "redis" ? "redis" : "postgres",
        }),
        "failed to record daily user activity",
      );
      expect(activity.redisSet).toHaveBeenCalledTimes(1);
      if (failure === "redis") {
        expect(activity.upsert).not.toHaveBeenCalled();
      } else {
        expect(activity.upsert).toHaveBeenCalledTimes(1);
      }

      const logged = JSON.stringify(activity.loggerWarn.mock.calls);
      expect(logged).not.toContain(USER_ID);
      expect(logged).not.toContain("owner@example.test");
      expect(logged).not.toContain("203.0.113.51");
      expect(logged).not.toContain("google-id-token");
      expect(logged).not.toContain("permission denied for table user_activity_daily");
      expect(logged).not.toContain("database connection failed");
      expect(logged).not.toContain("Redis unavailable");
    },
  );
});
