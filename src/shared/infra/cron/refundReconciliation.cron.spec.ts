/// <reference types="vitest/globals" />

const mockWithCronLock = vi.fn(async (...args: unknown[]) => {
  const fn = args[2] as (ctx: { isLockHeld: () => boolean }) => Promise<void>;
  return fn({ isLockHeld: () => lockHeld });
});
const mockReconcile = vi.fn();
let lockHeld = true;

vi.mock("node-cron", () => ({ default: { schedule: vi.fn() } }));
vi.mock("@/shared/infra/queue/redisConnection", () => ({
  getRedisConnection: vi.fn(() => ({})),
}));
vi.mock("@/shared/infra/redis/cronLock", () => ({
  withCronLock: (...args: unknown[]) => mockWithCronLock(...args),
  spDateKey: vi.fn(() => "2026-09-29"),
  spMinuteKey: vi.fn(() => "2026-09-29-14-05"),
  spSlotKey: vi.fn(() => "2026-09-29-14-05"),
}));
vi.mock("@/modules/payments/services/refundReconciliationService", () => ({
  reconcilePendingRefunds: (...args: unknown[]) => mockReconcile(...args),
}));

import cron from "node-cron";
import { scheduleRefundReconciliation } from "./refundReconciliation.cron";

describe("scheduleRefundReconciliation", () => {
  const log = { info: vi.fn(), error: vi.fn(), warn: vi.fn() };
  let handler: () => Promise<void>;

  beforeEach(() => {
    vi.clearAllMocks();
    lockHeld = true;
    mockReconcile.mockResolvedValue({ reconciled: 1, failed: 0 });
    (cron.schedule as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_expr: string, cb: () => Promise<void>) => {
        handler = cb;
      }
    );
    scheduleRefundReconciliation(log);
  });

  it("registra */5 com timezone America/Sao_Paulo", () => {
    expect(cron.schedule).toHaveBeenCalledTimes(1);
    const args = (cron.schedule as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(args[0]).toBe("*/5 * * * *");
    expect(args[2]).toEqual({ timezone: "America/Sao_Paulo" });
  });

  it("reconcilia dentro de withCronLock com scheduledKey de slot de 5 minutos", async () => {
    await handler();

    expect(mockWithCronLock).toHaveBeenCalledTimes(1);
    const [, options] = mockWithCronLock.mock.calls[0];
    expect(options).toEqual({
      jobName: "refund-reconciliation",
      scheduledKey: "2026-09-29-14-05",
      ttlMs: 240_000,
    });
    expect(mockReconcile).toHaveBeenCalledTimes(1);
  });

  it("não reconcilia quando o lock já foi perdido", async () => {
    lockHeld = false;

    await handler();

    expect(mockReconcile).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalled();
  });

  it("erro da reconciliação é capturado e logado", async () => {
    mockReconcile.mockRejectedValue(new Error("boom"));

    await expect(handler()).resolves.toBeUndefined();

    expect(log.error).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      "Falha no job de reconciliação de estornos"
    );
  });
});
