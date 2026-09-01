import { beforeEach, describe, expect, it, vi } from "vitest";

const { upsert } = vi.hoisted(() => ({ upsert: vi.fn() }));
vi.mock("@/libs/prismaClient", () => ({
  prisma: { crmFinancialEvent: { upsert } },
}));

import { recordCrmFinancialEvent } from "./crmLedger";

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
