/// <reference types="vitest/globals" />
import { AppError } from "@/shared/errors/AppError";

describe("LoginController — atividade diária de tráfego", () => {
  const userId = "33333333-3333-4333-8333-333333333333";

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

  type ActivityFailure =
    | "postgres-permission-denied"
    | "postgres-unavailable"
    | "redis";

  async function loadController(options: {
    fails?: boolean;
    activityFailure?: ActivityFailure;
  } = {}) {
    vi.resetModules();
    const recordUserActivity = vi.fn().mockResolvedValue(undefined);
    const logAccess = vi.fn().mockResolvedValue(undefined);
    const resetAttempts = vi.fn().mockResolvedValue(undefined);
    const recordFailure = vi.fn().mockResolvedValue({ locked: false });
    const activityRedisSet = vi.fn();
    const activityRedisDel = vi.fn();
    const activityUpsert = vi.fn();
    const activityLoggerWarn = vi.fn();

    vi.doUnmock("@/modules/traffic/infra/userActivity");
    if (
      options.activityFailure === "postgres-permission-denied" ||
      options.activityFailure === "postgres-unavailable"
    ) {
      activityRedisSet.mockResolvedValue("OK");
      activityRedisDel.mockResolvedValue(1);
      const postgresError =
        options.activityFailure === "postgres-permission-denied"
          ? Object.assign(
              new Error("permission denied for table user_activity_daily"),
              { code: "P2010" },
            )
          : Object.assign(new Error("database connection failed"), {
              name: "PrismaClientInitializationError",
              code: "P1001",
            });
      activityUpsert.mockRejectedValue(postgresError);
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
    } else if (options.activityFailure === "redis") {
      const redisError = Object.assign(new Error("Redis unavailable"), {
        name: "ConnectionError",
      });
      activityRedisSet.mockRejectedValue(redisError);
      activityRedisDel.mockRejectedValue(redisError);
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
    } else {
      vi.doMock("@/modules/traffic/infra/userActivity", () => ({
        recordUserActivity,
      }));
    }
    vi.doMock("@/shared/services/accessLogService", () => ({ logAccess }));
    vi.doMock("@/shared/services/bruteForceProtection", () => ({
      checkLock: vi.fn().mockResolvedValue({ locked: false }),
      recordFailure,
      resetAttempts,
    }));
    vi.doMock("./LoginUseCase", () => ({
      LoginUseCase: class {},
    }));
    vi.doMock("tsyringe", () => ({
      container: {
        resolve: () => ({
          execute: vi.fn(async () => {
            if (options.fails) throw new AppError("Credenciais inválidas", 401);
            return { user: { id: userId }, accessToken: "access-token" };
          }),
        }),
      },
    }));

    const { LoginController } = await import("./LoginController");
    return {
      controller: new LoginController(),
      recordUserActivity,
      logAccess,
      activity: {
        redisSet: activityRedisSet,
        redisDel: activityRedisDel,
        upsert: activityUpsert,
        loggerWarn: activityLoggerWarn,
      },
    };
  }

  it("registra a atividade após um login bem-sucedido e inclui userId no AccessLog", async () => {
    const { controller, recordUserActivity, logAccess } = await loadController();
    const { reply, state } = replyCapture();

    await controller.handle(
      {
        body: { email: "owner@example.test", password: "secret" },
        ip: "203.0.113.40",
        headers: { "user-agent": "test-browser" },
      } as any,
      reply as any,
    );

    expect(state.statusCode).toBe(200);
    expect(recordUserActivity).toHaveBeenCalledTimes(1);
    expect(recordUserActivity).toHaveBeenCalledWith(userId);
    expect(logAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        userId,
        action: "LOGIN",
        success: true,
      }),
    );
  });

  it.each([
    "postgres-permission-denied",
    "postgres-unavailable",
    "redis",
  ] as const)(
    "mantém o login por senha concluído quando a atividade falha no %s",
    async (failure) => {
      const { controller, activity } = await loadController({
        activityFailure: failure,
      });
      const { reply, state } = replyCapture();

      await controller.handle(
        {
          body: { email: "owner@example.test", password: "secret" },
          ip: "203.0.113.40",
          headers: { "user-agent": "test-browser" },
        } as any,
        reply as any,
      );

      expect(state.statusCode).toBe(200);
      expect(state.body).toMatchObject({ accessToken: "access-token" });
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
      expect(logged).not.toContain(userId);
      expect(logged).not.toContain("owner@example.test");
      expect(logged).not.toContain("203.0.113.40");
      expect(logged).not.toContain("secret");
      expect(logged).not.toContain("permission denied for table user_activity_daily");
      expect(logged).not.toContain("database connection failed");
      expect(logged).not.toContain("Redis unavailable");
    },
  );

  it("não registra atividade quando o login falha", async () => {
    const { controller, recordUserActivity, logAccess } = await loadController({
      fails: true,
    });
    const { reply } = replyCapture();

    await expect(
      controller.handle(
        {
          body: { email: "owner@example.test", password: "wrong" },
          ip: "203.0.113.41",
          headers: { "user-agent": "test-browser" },
        } as any,
        reply as any,
      ),
    ).rejects.toThrow();

    expect(recordUserActivity).not.toHaveBeenCalled();
    expect(logAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "LOGIN_FAILED",
        success: false,
      }),
    );
  });
});
