/// <reference types="vitest/globals" />

vi.mock("node-cron", () => {
  const cron = { schedule: vi.fn() };
  return { default: cron };
});

vi.mock("@/shared/infra/queue/redisConnection", () => ({
  getRedisConnection: vi.fn(() => ({})),
}));

vi.mock("@/shared/infra/redis/cronLock", () => ({
  spDateKey: vi.fn(() => "2026-10-09"),
  withCronLock: vi.fn(async (_redis: unknown, _options: unknown, fn: () => Promise<void>) => fn()),
}));

vi.mock("@/shared/utils/correlationContext", () => ({
  withCronCorrelation: vi.fn((_job: string, fn: () => Promise<void>) => fn),
}));

const prismaMock = vi.hoisted(() => ({
  $executeRawUnsafe: vi.fn(),
  notificationOutbox: { deleteMany: vi.fn() },
}));

vi.mock("@/libs/prismaClient", () => ({ prisma: prismaMock }));

import { buildCleanTableSql, cleanTable } from "./cleanOldLogs.cron";

describe("cleanOldLogs — limpeza de logs (LGPD)", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(["audit_logs", "access_logs", "error_logs"] as const)(
    "usa a coluna real createdAt em %s (não created_at)",
    (table) => {
      const sql = buildCleanTableSql(table);

      expect(sql).toContain(`FROM ${table} WHERE createdAt < $1`);
      expect(sql).not.toContain("created_at");
      expect(sql).toContain("LIMIT 1000");
    },
  );

  it("exclui em lotes até esvaziar e soma o total removido", async () => {
    prismaMock.$executeRawUnsafe
      .mockResolvedValueOnce(1000)
      .mockResolvedValueOnce(1000)
      .mockResolvedValueOnce(7);

    const total = await cleanTable("audit_logs");

    expect(total).toBe(2007);
    expect(prismaMock.$executeRawUnsafe).toHaveBeenCalledTimes(3);
    const [sql, cutoff] = prismaMock.$executeRawUnsafe.mock.calls[0];
    expect(sql).toContain("WHERE createdAt < $1");
    expect(cutoff).toBeInstanceOf(Date);
  });

  it("para no primeiro lote que não enche", async () => {
    prismaMock.$executeRawUnsafe.mockResolvedValueOnce(3);

    expect(await cleanTable("access_logs")).toBe(3);
    expect(prismaMock.$executeRawUnsafe).toHaveBeenCalledTimes(1);
  });

  it("recusa tabela fora da allowlist antes de tocar no banco", async () => {
    await expect(cleanTable("users")).rejects.toThrow("Tabela não permitida: users");
    expect(prismaMock.$executeRawUnsafe).not.toHaveBeenCalled();
  });
});
