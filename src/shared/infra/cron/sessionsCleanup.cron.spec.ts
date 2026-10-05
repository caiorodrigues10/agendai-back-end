/// <reference types="vitest/globals" />

vi.mock("node-cron", () => {
  const cron = { schedule: vi.fn() };
  return { default: cron };
});

vi.mock("@/shared/infra/queue/redisConnection", () => ({
  getRedisConnection: vi.fn(() => ({})),
}));

vi.mock("@/shared/infra/redis/cronLock", () => ({
  withCronLock: vi.fn(async (_redis: unknown, _options: unknown, fn: () => Promise<void>) => fn()),
}));

const prismaMock = vi.hoisted(() => ({
  userSession: { findMany: vi.fn(), deleteMany: vi.fn() },
}));

vi.mock("@/libs/prismaClient", () => ({ prisma: prismaMock }));

import cron from "node-cron";
import { withCronLock } from "@/shared/infra/redis/cronLock";
import { scheduleSessionsCleanup } from "./sessionsCleanup.cron";

const log = { info: vi.fn(), error: vi.fn() };

function lastScheduledTask(): () => Promise<void> {
  const args = (cron.schedule as unknown as { mock: { calls: unknown[][] } }).mock.calls.at(-1)!;
  return args[1] as () => Promise<void>;
}

describe("scheduleSessionsCleanup", () => {
  beforeEach(() => vi.clearAllMocks());

  it("agenda diariamente às 03:40 com timezone America/Sao_Paulo", () => {
    scheduleSessionsCleanup(log);

    const args = (cron.schedule as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
    expect(args[0]).toBe("40 3 * * *");
    expect(args[2]).toEqual({ timezone: "America/Sao_Paulo" });
    expect(log.info).toHaveBeenCalledWith(
      "[SessionsCleanup] Cron de limpeza de sessões agendado",
    );
  });

  it("exclui em lotes até esvaziar e loga a contagem total (com lock)", async () => {
    scheduleSessionsCleanup(log);

    prismaMock.userSession.findMany
      .mockResolvedValueOnce(Array.from({ length: 1000 }, (_, i) => ({ id: `s${i}` })))
      .mockResolvedValueOnce([{ id: "last" }]);
    prismaMock.userSession.deleteMany
      .mockResolvedValueOnce({ count: 1000 })
      .mockResolvedValueOnce({ count: 1 });

    await lastScheduledTask()();

    expect(withCronLock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ jobName: "sessions-cleanup" }),
      expect.any(Function),
    );
    const where = prismaMock.userSession.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { expiresAt: { lt: expect.any(Date) }, revokedAt: null },
      { revokedAt: { lt: expect.any(Date) } },
    ]);
    expect(prismaMock.userSession.deleteMany).toHaveBeenCalledTimes(2);
    expect(log.info).toHaveBeenCalledWith(
      { removed: 1001 },
      "[SessionsCleanup] Old user sessions removed",
    );
  });

  it("erro de banco é capturado e logado, sem propagar", async () => {
    scheduleSessionsCleanup(log);
    prismaMock.userSession.findMany.mockRejectedValue(new Error("db down"));

    await expect(lastScheduledTask()()).resolves.toBeUndefined();
    expect(log.error).toHaveBeenCalled();
  });
});
