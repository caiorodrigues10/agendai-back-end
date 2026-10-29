import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  importBatchFindFirst,
  importBatchUpdateMany,
  createdEntityFindMany,
  appointmentFindMany,
  appointmentFindFirst,
  salonClientFindFirst,
  salonClientUpdate,
  salonClientUpdateMany,
  prismaMock,
} = vi.hoisted(() => {
  const importBatchFindFirst = vi.fn();
  const importBatchUpdateMany = vi.fn();
  const createdEntityFindMany = vi.fn();
  const appointmentFindMany = vi.fn();
  const appointmentFindFirst = vi.fn();
  const salonClientFindFirst = vi.fn();
  const salonClientUpdate = vi.fn();
  const salonClientUpdateMany = vi.fn();

  return {
    importBatchFindFirst,
    importBatchUpdateMany,
    createdEntityFindMany,
    appointmentFindMany,
    appointmentFindFirst,
    salonClientFindFirst,
    salonClientUpdate,
    salonClientUpdateMany,
    prismaMock: {
      importBatch: { findFirst: importBatchFindFirst, updateMany: importBatchUpdateMany },
      importCreatedEntity: { findMany: createdEntityFindMany },
      appointment: { findMany: appointmentFindMany, findFirst: appointmentFindFirst },
      salonClient: {
        findFirst: salonClientFindFirst,
        update: salonClientUpdate,
        updateMany: salonClientUpdateMany,
      },
    },
  };
});

vi.mock("@/libs/prismaClient", () => ({ prisma: prismaMock }));

import { applyCrmCountersForBatch, revertCrmCountersForBatch } from "./crmCounters";

const SHOP = "shop-1";
const BATCH = "batch-1";

describe("contadores de CRM da importação", () => {
  beforeEach(() => {
    importBatchFindFirst.mockReset().mockResolvedValue({ id: BATCH, crmCountersAppliedAt: null });
    importBatchUpdateMany.mockReset().mockResolvedValue({ count: 1 });
    createdEntityFindMany.mockReset().mockResolvedValue([{ entityId: "appt-1" }]);
    appointmentFindMany.mockReset().mockResolvedValue([
      { clientId: "client-1", date: new Date("2026-11-05T00:00:00.000Z"), status: "COMPLETED" },
    ]);
    appointmentFindFirst.mockReset().mockResolvedValue(null);
    salonClientFindFirst.mockReset().mockResolvedValue({ id: "client-1", lastVisitAt: null });
    salonClientUpdate.mockReset().mockResolvedValue({});
    salonClientUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  });

  it("soma o total de agendamentos e registra a última visita do cliente", async () => {
    const result = await applyCrmCountersForBatch(BATCH, SHOP);

    expect(result.applied).toBe(true);
    expect(result.appointments).toBe(1);
    expect(salonClientUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "client-1" },
        data: expect.objectContaining({
          totalAppointments: { increment: 1 },
          lastVisitAt: new Date("2026-11-05T00:00:00.000Z"),
        }),
      }),
    );
  });

  it("não conta duas vezes quando o lote é reprocessado", async () => {
    importBatchFindFirst.mockResolvedValue({
      id: BATCH,
      crmCountersAppliedAt: new Date("2026-11-05T12:00:00.000Z"),
    });

    const result = await applyCrmCountersForBatch(BATCH, SHOP);

    expect(result.applied).toBe(false);
    expect(salonClientUpdate).not.toHaveBeenCalled();
  });

  it("não mexe em agendamento que não é visita (sem atendimento)", async () => {
    appointmentFindMany.mockResolvedValue([
      { clientId: "client-1", date: new Date("2026-11-05T00:00:00.000Z"), status: "CONFIRMED" },
    ]);

    await applyCrmCountersForBatch(BATCH, SHOP);

    expect(salonClientUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ totalAppointments: { increment: 1 } }),
      }),
    );
    expect(salonClientUpdate.mock.calls[0][0].data.lastVisitAt).toBeUndefined();
  });

  it("não regride a última visita quando o cliente já tem uma mais recente", async () => {
    salonClientFindFirst.mockResolvedValue({
      id: "client-1",
      lastVisitAt: new Date("2026-12-01T00:00:00.000Z"),
    });

    await applyCrmCountersForBatch(BATCH, SHOP);

    expect(salonClientUpdate.mock.calls[0][0].data.lastVisitAt).toEqual(
      new Date("2026-12-01T00:00:00.000Z"),
    );
  });

  it("desfazer devolve a contagem e recalcula a última visita", async () => {
    appointmentFindMany.mockResolvedValue([]);

    await revertCrmCountersForBatch(SHOP, [
      {
        clientId: "client-1",
        date: new Date("2026-11-05T00:00:00.000Z"),
        status: "COMPLETED",
      },
    ]);

    expect(salonClientUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "client-1", barbershopId: SHOP },
        data: expect.objectContaining({ totalAppointments: { decrement: 1 } }),
      }),
    );
  });
});
