import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  importBatchFindUnique,
  importBatchUpdateMany,
  barbershopFindUnique,
  rowResultCreateMany,
  rowResultFindMany,
  createdEntityCreateMany,
  readSpreadsheetSheets,
  txMock,
} = vi.hoisted(() => {
  const importBatchFindUnique = vi.fn();
  const importBatchUpdateMany = vi.fn();
  const barbershopFindUnique = vi.fn();
  const rowResultCreateMany = vi.fn();
  const rowResultFindMany = vi.fn();
  const createdEntityCreateMany = vi.fn();
  const readSpreadsheetSheets = vi.fn();

  return {
    importBatchFindUnique,
    importBatchUpdateMany,
    barbershopFindUnique,
    rowResultCreateMany,
    rowResultFindMany,
    createdEntityCreateMany,
    readSpreadsheetSheets,
    txMock: {
      salonClient: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "client-1" }),
      },
      service: { findMany: vi.fn().mockResolvedValue([]) },
    },
  };
});

vi.mock("@/libs/prismaClient", () => ({
  prisma: {
    importBatch: { findUnique: importBatchFindUnique, updateMany: importBatchUpdateMany },
    barbershop: { findUnique: barbershopFindUnique },
    importRowResult: { createMany: rowResultCreateMany, findMany: rowResultFindMany },
    importCreatedEntity: { createMany: createdEntityCreateMany },
  },
}));

vi.mock("@/libs/prismaExtensions", () => ({
  rlsTransaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(txMock),
}));

vi.mock("@/shared/infra/http/requestContext", () => ({
  requestContext: { run: (_ctx: unknown, fn: () => Promise<unknown>) => fn() },
}));

vi.mock("./utils/spreadsheetParser", () => ({ readSpreadsheetSheets: () => readSpreadsheetSheets() }));

vi.mock("./utils/tempFiles", () => ({ deleteTempFile: vi.fn(async () => undefined) }));

vi.mock("./crmCounters", () => ({
  applyCrmCountersForBatch: vi.fn(async () => ({ clients: 0, appointments: 0, visits: 0, applied: true })),
}));

import { processImportBatch } from "./importProcessor";

const SHOP = "shop-1";
const BATCH = "batch-1";

const OPCOES = {
  updateExisting: true,
  countFinancialValues: false,
  sendReviewInvitations: false,
  includeCase: false,
  replaceExistingSchedules: false,
  importTimeOffAsPending: false,
  updateExistingProducts: false,
  createProductCategories: false,
  sendFiadoReminders: false,
};

function lote(overrides: Record<string, unknown> = {}) {
  return {
    id: BATCH,
    barbershopId: SHOP,
    status: "PROCESSING",
    filePath: "/tmp/planilha.xlsx",
    fileFormat: "XLSX",
    sheetName: "Clientes",
    targetType: "MIXED",
    mapping: {
      version: 2,
      sheets: [
        { sheetName: "Clientes", targetType: "CLIENTS", columns: { "0": "name", "1": "whatsapp" }, options: OPCOES },
        { sheetName: "Agenda", targetType: "APPOINTMENTS", columns: { "0": "clientName", "1": "clientWhatsapp", "2": "date", "3": "time" }, options: OPCOES },
      ],
    },
    totalRows: 0,
    processedRows: 0,
    importedRows: 0,
    failedRows: 0,
    skippedRows: 0,
    createdById: "user-1",
    createdAt: new Date("2026-11-05T12:00:00.000Z"),
    ...overrides,
  };
}

describe("worker multi-aba", () => {
  beforeEach(() => {
    importBatchFindUnique.mockReset().mockResolvedValue(lote());
    importBatchUpdateMany.mockReset().mockResolvedValue({ count: 1 });
    barbershopFindUnique.mockReset().mockResolvedValue({ businessSegment: "BARBERSHOP" });
    rowResultCreateMany.mockReset().mockResolvedValue({ count: 0 });
    rowResultFindMany.mockReset().mockResolvedValue([]);
    createdEntityCreateMany.mockReset().mockResolvedValue({ count: 0 });
  });

  it("ignora lote que não está em processamento", async () => {
    importBatchFindUnique.mockResolvedValue(lote({ status: "COMPLETED" }));

    const result = await processImportBatch(BATCH);

    expect(result.importedRows).toBe(0);
    expect(rowResultCreateMany).not.toHaveBeenCalled();
  });

  it("processa as abas na ordem de dependência e grava a aba de cada linha", async () => {
    readSpreadsheetSheets.mockResolvedValue([
      {
        sheetName: "Agenda",
        headers: ["Cliente", "WhatsApp", "Data", "Hora"],
        rows: [{ Cliente: "Ana", WhatsApp: "11987654321", Data: "05/11/2026", Hora: "14:00" }],
      },
      {
        sheetName: "Clientes",
        headers: ["Nome", "WhatsApp"],
        rows: [{ Nome: "Ana", WhatsApp: "11987654321" }],
      },
    ]);

    const result = await processImportBatch(BATCH);

    // Nenhuma linha entra (o mock do banco não devolve nada), mas o worker
    // precisa ter lido as duas abas e gravado o resultado por aba.
    expect(readSpreadsheetSheets).toHaveBeenCalledTimes(1);
    const sheetNames = rowResultCreateMany.mock.calls.flatMap((call) =>
      (call[0].data as Array<{ sheetName: string }>).map((row) => row.sheetName),
    );
    expect(new Set(sheetNames)).toEqual(new Set(["Agenda", "Clientes"]));
    expect(result.totalRows).toBe(2);
  });

  it("pula a linha já processada (retomada do lote)", async () => {
    readSpreadsheetSheets.mockResolvedValue([
      {
        sheetName: "Clientes",
        headers: ["Nome", "WhatsApp"],
        rows: [
          { Nome: "Ana", WhatsApp: "11987654321" },
          { Nome: "Bruno", WhatsApp: "11888888888" },
        ],
      },
    ]);
    rowResultFindMany.mockResolvedValue([
      { sheetName: "Clientes", rowNumber: 1, status: "IMPORTED", entityId: null, entityType: null },
    ]);

    await processImportBatch(BATCH);

    const gravadas = rowResultCreateMany.mock.calls.flatMap(
      (call) => call[0].data as Array<{ rowNumber: number }>,
    );
    expect(gravadas).toHaveLength(1);
    expect(gravadas[0].rowNumber).toBe(2);
  });

  it("marca o lote como concluído com erros quando alguma linha falha", async () => {
    readSpreadsheetSheets.mockResolvedValue([
      {
        sheetName: "Clientes",
        headers: ["Nome", "WhatsApp"],
        rows: [{ Nome: "Ana", WhatsApp: "11987654321" }],
      },
    ]);

    await processImportBatch(BATCH);

    const updates = importBatchUpdateMany.mock.calls.map((call) => call[0].data);
    const final = updates[updates.length - 1];
    expect(final.status).toBe("COMPLETED");
    expect(final.finishedAt).toBeTruthy();
  });

  it("falha o lote quando o plano não existe", async () => {
    importBatchFindUnique.mockResolvedValue(lote({ mapping: null }));

    await expect(processImportBatch(BATCH)).rejects.toThrow(/Mapeamento/i);

    const updates = importBatchUpdateMany.mock.calls.map((call) => call[0].data);
    expect(updates[updates.length - 1].status).toBe("FAILED");
  });
});
