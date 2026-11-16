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

  async function loadController(options: { fails?: boolean } = {}) {
    vi.resetModules();
    const recordUserActivity = vi.fn().mockResolvedValue(undefined);
    const logAccess = vi.fn().mockResolvedValue(undefined);
    const resetAttempts = vi.fn().mockResolvedValue(undefined);
    const recordFailure = vi.fn().mockResolvedValue({ locked: false });

    vi.doMock("@/modules/traffic/infra/userActivity", () => ({
      recordUserActivity,
    }));
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
