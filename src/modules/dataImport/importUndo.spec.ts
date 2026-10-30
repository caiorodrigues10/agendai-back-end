import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  importBatchFindFirst,
  importBatchUpdateMany,
  createdEntityList,
  createdEntityMarkUndone,
  appointmentFindFirst,
  appointmentDelete,
  salonClientFindFirst,
  salonClientDelete,
  serviceFindFirst,
  serviceDelete,
  clientCaseFindFirst,
  clientCaseDelete,
  txMock,
} = vi.hoisted(() => {
  const importBatchFindFirst = vi.fn();
  const importBatchUpdateMany = vi.fn();
  const createdEntityList = vi.fn();
  const createdEntityMarkUndone = vi.fn();
  const appointmentFindFirst = vi.fn();
  const appointmentDelete = vi.fn();
  const salonClientFindFirst = vi.fn();
  const salonClientDelete = vi.fn();
  const serviceFindFirst = vi.fn();
  const serviceDelete = vi.fn();
  const clientCaseFindFirst = vi.fn();
  const clientCaseDelete = vi.fn();

  return {
    importBatchFindFirst,
    importBatchUpdateMany,
    createdEntityList,
    createdEntityMarkUndone,
    appointmentFindFirst,
    appointmentDelete,
    salonClientFindFirst,
    salonClientDelete,
    serviceFindFirst,
    serviceDelete,
    clientCaseFindFirst,
    clientCaseDelete,
    txMock: {
      importBatch: { findFirst: importBatchFindFirst, updateMany: importBatchUpdateMany },
      importCreatedEntity: { findMany: createdEntityList, updateMany: createdEntityMarkUndone },
      appointment: { findFirst: appointmentFindFirst, delete: appointmentDelete },
      salonClient: { findFirst: salonClientFindFirst, delete: salonClientDelete },
      service: { findFirst: serviceFindFirst, delete: serviceDelete },
      clientCase: { findFirst: clientCaseFindFirst, delete: clientCaseDelete },
    },
  };
});

vi.mock("@/libs/prismaClient", () => ({
  prisma: txMock,
}));

vi.mock("@/libs/prismaExtensions", () => ({
  rlsTransaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(txMock),
}));

vi.mock("@/shared/infra/http/requestContext", () => ({
  requestContext: { run: (_ctx: unknown, fn: () => Promise<unknown>) => fn() },
}));

import { undoImportBatch } from "./importUndo";

const SHOP = "shop-1";
const BATCH = "batch-1";
const AGORA = new Date("2026-11-05T12:00:00.000Z");

function lote(overrides: Record<string, unknown> = {}) {
  return {
    id: BATCH,
    barbershopId: SHOP,
    status: "COMPLETED",
    undoneAt: null,
    createdAt: new Date("2026-11-01T12:00:00.000Z"),
    finishedAt: new Date("2026-11-01T13:00:00.000Z"),
    expiresAt: new Date("2026-12-01T12:00:00.000Z"),
    ...overrides,
  };
}

describe("undoImportBatch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(AGORA);
    importBatchFindFirst.mockReset().mockResolvedValue(lote());
    importBatchUpdateMany.mockReset().mockResolvedValue({ count: 1 });
    createdEntityList.mockReset().mockResolvedValue([]);
    createdEntityMarkUndone.mockReset().mockResolvedValue({ count: 0 });
    appointmentFindFirst.mockReset().mockResolvedValue(null);
    appointmentDelete.mockReset().mockResolvedValue({});
    salonClientFindFirst.mockReset().mockResolvedValue(null);
    salonClientDelete.mockReset().mockResolvedValue({});
    serviceFindFirst.mockReset().mockResolvedValue(null);
    serviceDelete.mockReset().mockResolvedValue({});
    clientCaseFindFirst.mockReset().mockResolvedValue(null);
    clientCaseDelete.mockReset().mockResolvedValue({});
  });

  it("remove o cliente criado pelo lote", async () => {
    createdEntityList.mockResolvedValue([{ id: "e1", entityType: "CLIENT", entityId: "client-1" }]);
    salonClientFindFirst.mockResolvedValue({
      id: "client-1",
      updatedAt: new Date("2026-11-01T13:00:00.000Z"),
      _count: { appointments: 0, packages: 0, fiados: 0, financialEvents: 0, reviews: 0 },
    });

    const result = await undoImportBatch(SHOP, BATCH);

    expect(result.removed).toBe(1);
    expect(salonClientDelete).toHaveBeenCalledWith({ where: { id: "client-1" } });
    expect(importBatchUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "UNDONE" }) }),
    );
  });

  it("preserva cliente que ganhou movimentação depois da importação", async () => {
    createdEntityList.mockResolvedValue([{ id: "e1", entityType: "CLIENT", entityId: "client-1" }]);
    salonClientFindFirst.mockResolvedValue({
      id: "client-1",
      updatedAt: new Date("2026-11-01T13:00:00.000Z"),
      _count: { appointments: 2, packages: 0, fiados: 0, financialEvents: 0, reviews: 0 },
    });

    const result = await undoImportBatch(SHOP, BATCH);

    expect(result.removed).toBe(0);
    expect(result.kept).toBe(1);
    expect(salonClientDelete).not.toHaveBeenCalled();
  });

  it("preserva cliente alterado depois da importação", async () => {
    createdEntityList.mockResolvedValue([{ id: "e1", entityType: "CLIENT", entityId: "client-1" }]);
    salonClientFindFirst.mockResolvedValue({
      id: "client-1",
      updatedAt: new Date("2026-11-03T09:00:00.000Z"),
      _count: { appointments: 0, packages: 0, fiados: 0, financialEvents: 0, reviews: 0 },
    });

    const result = await undoImportBatch(SHOP, BATCH);

    expect(result.kept).toBe(1);
    expect(result.details[0].reason).toMatch(/alterado/i);
  });

  it("preserva agendamento que ganhou pagamento", async () => {
    createdEntityList.mockResolvedValue([{ id: "e1", entityType: "APPOINTMENT", entityId: "appt-1" }]);
    appointmentFindFirst.mockResolvedValue({
      id: "appt-1",
      updatedAt: new Date("2026-11-01T13:00:00.000Z"),
      review: null,
      deposit: { id: "dep-1" },
      _count: { commissionEntries: 0, queueItems: 0 },
    });

    const result = await undoImportBatch(SHOP, BATCH);

    expect(result.kept).toBe(1);
    expect(appointmentDelete).not.toHaveBeenCalled();
  });

  it("remove agendamento intacto", async () => {
    createdEntityList.mockResolvedValue([{ id: "e1", entityType: "APPOINTMENT", entityId: "appt-1" }]);
    appointmentFindFirst.mockResolvedValue({
      id: "appt-1",
      updatedAt: new Date("2026-11-01T13:00:00.000Z"),
      review: null,
      deposit: null,
      _count: { commissionEntries: 0, queueItems: 0 },
    });

    const result = await undoImportBatch(SHOP, BATCH);

    expect(result.removed).toBe(1);
    expect(appointmentDelete).toHaveBeenCalledWith({ where: { id: "appt-1" } });
  });

  it("recusa desfazer depois da janela de 30 dias", async () => {
    importBatchFindFirst.mockResolvedValue(
      lote({ expiresAt: new Date("2026-10-20T12:00:00.000Z") }),
    );

    await expect(undoImportBatch(SHOP, BATCH)).rejects.toThrow(/30 dias/i);
  });

  it("recusa desfazer um lote já desfeito", async () => {
    importBatchFindFirst.mockResolvedValue(lote({ undoneAt: new Date("2026-11-02T12:00:00.000Z") }));

    await expect(undoImportBatch(SHOP, BATCH)).rejects.toThrow(/já foi desfeita/i);
  });

  it("recusa desfazer um lote em processamento", async () => {
    importBatchFindFirst.mockResolvedValue(lote({ status: "PROCESSING" }));

    await expect(undoImportBatch(SHOP, BATCH)).rejects.toThrow(/concluída/i);
  });

  it("não acha lote de outro salão", async () => {
    importBatchFindFirst.mockResolvedValue(null);

    await expect(undoImportBatch(SHOP, BATCH)).rejects.toThrow(/não encontrada/i);
  });
});
