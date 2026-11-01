/// <reference types="vitest/globals" />

const { upsert, findFirst, create } = vi.hoisted(() => ({
  upsert: vi.fn(),
  findFirst: vi.fn(),
  create: vi.fn(),
}));
vi.mock("@/libs/prismaClient", () => ({
  prisma: { crmFinancialEvent: { upsert }, crmBackfillRun: { findFirst, create } },
}));

import { recordCrmFinancialEvent, runCrmBackfill } from "./crmLedger";

describe("recordCrmFinancialEvent", () => {
  beforeEach(() => upsert.mockReset().mockResolvedValue({ id: "event-1" }));

  it("grava pela chave idempotente de origem e nunca atualiza lançamento existente", async () => {
    await recordCrmFinancialEvent({
      barbershopId: "shop-1", clientId: "client-1", kind: "SERVICE_COMPLETED",
      sourceType: "queue", sourceId: "queue-1", grossAmount: 55, receivedAmount: 55,
      occurredAt: new Date("2026-09-01T12:00:00.000Z"),
    });

    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { barbershopId_sourceType_sourceId_kind: { barbershopId: "shop-1", sourceType: "queue", sourceId: "queue-1", kind: "SERVICE_COMPLETED" } },
      create: expect.objectContaining({ grossAmount: 55, receivedAmount: 55, outstandingDelta: 0 }),
      update: {},
    }));
  });
});

describe("runCrmBackfill", () => {
  beforeEach(() => {
    findFirst.mockReset().mockResolvedValue(null);
    create.mockReset().mockResolvedValue({ id: "run-1" });
  });

  it("bloqueia uma segunda execução enquanto houver uma em andamento no salão", async () => {
    findFirst.mockResolvedValue({ id: "run-running" });

    await expect(
      runCrmBackfill("shop-1", { scope: "TENANT", triggeredById: "master-1" }),
    ).rejects.toThrow(/em andamento/i);
    expect(create).not.toHaveBeenCalled();
  });

  it("registra quem disparou e o escopo da execução", async () => {
    await expect(
      runCrmBackfill("shop-1", { scope: "GLOBAL", triggeredById: "master-1" }),
    ).rejects.toThrow();

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          barbershopId: "shop-1",
          scope: "GLOBAL",
          triggeredById: "master-1",
          status: "RUNNING",
        }),
      }),
    );
  });
});
