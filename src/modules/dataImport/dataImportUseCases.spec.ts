import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  importBatchCreate,
  importBatchFindFirst,
  importBatchUpdateMany,
  importBatchFindActive,
  importBatchCountStartedSince,
  barbershopFindUnique,
  auditLogCreate,
} = vi.hoisted(() => ({
  importBatchCreate: vi.fn(),
  importBatchFindFirst: vi.fn(),
  importBatchUpdateMany: vi.fn(),
  importBatchFindActive: vi.fn(),
  importBatchCountStartedSince: vi.fn(),
  barbershopFindUnique: vi.fn(),
  auditLogCreate: vi.fn(),
}));

const { saveTempFile, deleteTempFile } = vi.hoisted(() => ({
  saveTempFile: vi.fn(async () => "/tmp/agendai-imports/arquivo.csv"),
  deleteTempFile: vi.fn(async () => undefined),
}));

vi.mock("@/libs/prismaClient", () => ({
  prisma: {
    importBatch: {
      create: importBatchCreate,
      findFirst: importBatchFindFirst,
      updateMany: importBatchUpdateMany,
      findMany: importBatchFindActive,
      count: importBatchCountStartedSince,
    },
    barbershop: { findUnique: barbershopFindUnique },
    auditLog: { create: auditLogCreate },
  },
}));

vi.mock("./utils/spreadsheetParser", () => ({
  readSpreadsheet: vi.fn(async () => ({
    headers: ["Nome", "WhatsApp"],
    rows: [
      { Nome: "Ana", WhatsApp: "11987654321" },
      { Nome: "Bruno", WhatsApp: "11888888888" },
    ],
    sheetNames: [],
    selectedSheet: null,
  })),
  readSpreadsheetSheets: vi.fn(async () => [
    {
      sheetName: null,
      headers: ["Nome", "WhatsApp"],
      rows: [
        { Nome: "Ana", WhatsApp: "11987654321" },
        { Nome: "Bruno", WhatsApp: "11888888888" },
      ],
    },
  ]),
  readSpreadsheetPreview: vi.fn(async () => ({
    headers: ["Nome", "WhatsApp"],
    rows: [{ Nome: "Ana", WhatsApp: "11987654321" }],
    sheetNames: [],
    selectedSheet: null,
  })),
}));

vi.mock("./utils/tempFiles", () => ({
  saveTempFile,
  deleteTempFile,
  cleanupOldTempFiles: vi.fn(async () => 0),
}));

import { DataImportUseCases } from "./dataImportUseCases";

const SHOP = "shop-1";
const BATCH = "11111111-1111-1111-1111-111111111111";

function lote(overrides: Record<string, unknown> = {}) {
  return {
    id: BATCH,
    barbershopId: SHOP,
    fileName: "clientes.csv",
    filePath: "/tmp/agendai-imports/arquivo.csv",
    fileSize: 100,
    fileFormat: "CSV",
    sheetName: null,
    targetType: "CLIENTS",
    status: "MAPPING",
    headers: ["Nome", "WhatsApp"],
    mapping: null,
    totalRows: 0,
    processedRows: 0,
    importedRows: 0,
    failedRows: 0,
    skippedRows: 0,
    errorMessage: null,
    createdById: null,
    createdAt: new Date("2026-11-01T12:00:00.000Z"),
    updatedAt: new Date("2026-11-01T12:00:00.000Z"),
    startedAt: null,
    finishedAt: null,
    undoneAt: null,
    expiresAt: new Date("2026-12-01T12:00:00.000Z"),
    ...overrides,
  };
}

describe("DataImportUseCases", () => {
  beforeEach(() => {
    importBatchCreate.mockReset().mockResolvedValue(lote({ id: BATCH }));
    importBatchFindFirst.mockReset().mockResolvedValue(lote());
    importBatchUpdateMany.mockReset().mockResolvedValue({ count: 1 });
    importBatchFindActive.mockReset().mockResolvedValue([]);
    importBatchCountStartedSince.mockReset().mockResolvedValue(0);
    barbershopFindUnique.mockReset().mockResolvedValue({ businessSegment: "BARBERSHOP" });
    auditLogCreate.mockReset().mockResolvedValue({ id: "audit-1" });
  });

  describe("upload", () => {
    it("recusa quando já existe uma importação ativa", async () => {
      importBatchFindActive.mockResolvedValue([lote()]);

      await expect(
        new DataImportUseCases().upload({
          barbershopId: SHOP,
          fileName: "clientes.csv",
          buffer: Buffer.from("Nome;WhatsApp\nAna;11987654321"),
        }),
      ).rejects.toThrow(/já existe uma importação/i);
    });

    it("recusa quando o limite de 5 importações por hora estourou", async () => {
      importBatchCountStartedSince.mockResolvedValue(5);

      await expect(
        new DataImportUseCases().upload({
          barbershopId: SHOP,
          fileName: "clientes.csv",
          buffer: Buffer.from("Nome;WhatsApp\nAna;11987654321"),
        }),
      ).rejects.toThrow(/5 importações por hora/i);
    });

    it("recusa arquivo cujo conteúdo não é planilha (a extensão não decide)", async () => {
      await expect(
        new DataImportUseCases().upload({
          barbershopId: SHOP,
          fileName: "clientes.csv",
          buffer: Buffer.from([0x00, 0x01, 0x02, 0x00]),
        }),
      ).rejects.toThrow(/texto/i);
    });

    it("aceita .txt quando o conteúdo é texto delimitado", async () => {
      const result = await new DataImportUseCases().upload({
        barbershopId: SHOP,
        fileName: "clientes.txt",
        buffer: Buffer.from("Nome;WhatsApp\nAna;11987654321"),
      });

      expect(result.fileFormat).toBe("CSV");
    });

    it("grava exatamente 1 AuditLog no upload do painel web, com o userId", async () => {
      await new DataImportUseCases().upload({
        barbershopId: SHOP,
        userId: "user-web",
        fileName: "clientes.csv",
        buffer: Buffer.from("Nome;WhatsApp\nAna;11987654321"),
        source: "WEB",
      });

      expect(auditLogCreate).toHaveBeenCalledTimes(1);
      expect(auditLogCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: "user-web",
            action: "DATA_IMPORT_UPLOAD",
            barbershopId: SHOP,
          }),
        })
      );
    });

    it("grava exatamente 1 AuditLog no upload pelo WhatsApp, com o userId", async () => {
      await new DataImportUseCases().upload({
        barbershopId: SHOP,
        userId: "user-whatsapp",
        fileName: "clientes.csv",
        buffer: Buffer.from("Nome;WhatsApp\nAna;11987654321"),
        source: "WHATSAPP_OWNER_BOT",
      });

      expect(auditLogCreate).toHaveBeenCalledTimes(1);
      expect(auditLogCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: "user-whatsapp",
            action: "DATA_IMPORT_UPLOAD",
            barbershopId: SHOP,
            details: expect.stringContaining("WHATSAPP_OWNER_BOT"),
          }),
        })
      );
    });

    it("cria o lote com o cabeçalho lido", async () => {
      const result = await new DataImportUseCases().upload({
        barbershopId: SHOP,
        fileName: "clientes.csv",
        buffer: Buffer.from("Nome;WhatsApp\nAna;11987654321\nBruno;11888888888"),
      });

      expect(result.headers).toEqual(["Nome", "WhatsApp"]);
      expect(result.totalRows).toBe(2);
      expect(importBatchCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ barbershopId: SHOP, fileFormat: "CSV" }),
        }),
      );
    });

    it("guarda no lote o caminho do arquivo e NÃO apaga o temporário no upload", async () => {
      await new DataImportUseCases().upload({
        barbershopId: SHOP,
        fileName: "clientes.csv",
        buffer: Buffer.from("Nome;WhatsApp\nAna;11987654321"),
      });

      const data = importBatchCreate.mock.calls[0][0].data;
      // O arquivo precisa sobreviver ao upload: é dele que a etapa seguinte
      // (`PATCH /imports/:id/target`) lê a planilha. Com `filePath` vazio (ou
      // com o arquivo já apagado) essa leitura falha e a rota devolve 410
      // ("O arquivo enviado não está mais disponível").
      expect(data.filePath).toBe("/tmp/agendai-imports/arquivo.csv");
      expect(deleteTempFile).not.toHaveBeenCalled();
    });
  });

  describe("saveMapping", () => {
    it("recusa mapa sem o campo obrigatório", async () => {
      await expect(
        new DataImportUseCases().saveMapping({
          barbershopId: SHOP,
          batchId: BATCH,
          columns: { "0": "name" },
        }),
      ).rejects.toThrow(/Falta mapear/i);
    });

    it("recusa campo que não se aplica ao alvo", async () => {
      await expect(
        new DataImportUseCases().saveMapping({
          barbershopId: SHOP,
          batchId: BATCH,
          columns: { "0": "name", "1": "whatsapp", "2": "durationMinutes" },
        }),
      ).rejects.toThrow(/não se aplica/i);
    });

    it("salva o mapa e as opções", async () => {
      const result = await new DataImportUseCases().saveMapping({
        barbershopId: SHOP,
        batchId: BATCH,
        columns: { "0": "name", "1": "whatsapp" },
        options: { countFinancialValues: true },
      });

      expect(result.status).toBe("MAPPING");
      expect(importBatchUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            mapping: expect.objectContaining({
              version: 2,
              sheets: expect.arrayContaining([
                expect.objectContaining({
                  targetType: "CLIENTS",
                  columns: { "0": "name", "1": "whatsapp" },
                  options: expect.objectContaining({ countFinancialValues: true }),
                }),
              ]),
            }),
          }),
        }),
      );
    });

    it("não deixa ligar a contabilidade financeira sem querer (padrão desligado)", async () => {
      await new DataImportUseCases().saveMapping({
        barbershopId: SHOP,
        batchId: BATCH,
        columns: { "0": "name", "1": "whatsapp" },
      });

      const data = importBatchUpdateMany.mock.calls[0][0].data;
      const options = data.mapping.sheets[0].options;
      expect(options.countFinancialValues).toBe(false);
      expect(options.sendReviewInvitations).toBe(false);
    });
  });

  describe("validate", () => {
    it("recusa quando o mapa ainda não foi salvo", async () => {
      await expect(
        new DataImportUseCases().validate({ barbershopId: SHOP, batchId: BATCH }),
      ).rejects.toThrow(/Mapeie as colunas/i);
    });
  });

  describe("confirm", () => {
    it("recusa confirmar sem mapa", async () => {
      await expect(
        new DataImportUseCases().confirm({ barbershopId: SHOP, batchId: BATCH }),
      ).rejects.toThrow(/Mapeie as colunas/i);
    });

    it("recusa confirmar lote já concluído", async () => {
      importBatchFindFirst.mockResolvedValue(
        lote({ status: "COMPLETED", mapping: { columns: { "0": "name" }, options: {} } }),
      );

      await expect(
        new DataImportUseCases().confirm({ barbershopId: SHOP, batchId: BATCH }),
      ).rejects.toThrow(/já foi concluído/i);
    });
  });

  describe("cancel", () => {
    it("cancela o lote e apaga o arquivo", async () => {
      const result = await new DataImportUseCases().cancel({ barbershopId: SHOP, batchId: BATCH });
      expect(result.status).toBe("CANCELLED");
    });

    it("não cancela lote em processamento", async () => {
      importBatchFindFirst.mockResolvedValue(lote({ status: "PROCESSING" }));

      await expect(
        new DataImportUseCases().cancel({ barbershopId: SHOP, batchId: BATCH }),
      ).rejects.toThrow(/em processamento/i);
    });
  });

  describe("canUndo", () => {
    const useCases = new DataImportUseCases();

    it("permite desfazer dentro da janela", () => {
      expect(
        useCases.canUndo({
          status: "COMPLETED",
          undoneAt: null,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        }),
      ).toBe(true);
    });

    it("não permite desfazer fora da janela", () => {
      expect(
        useCases.canUndo({
          status: "COMPLETED",
          undoneAt: null,
          expiresAt: new Date(Date.now() - 1000),
        }),
      ).toBe(false);
    });

    it("não permite desfazer duas vezes", () => {
      expect(
        useCases.canUndo({
          status: "COMPLETED",
          undoneAt: new Date(),
          expiresAt: new Date(Date.now() + 1000),
        }),
      ).toBe(false);
    });

    it("não permite desfazer lote em andamento", () => {
      expect(
        useCases.canUndo({
          status: "PROCESSING",
          undoneAt: null,
          expiresAt: new Date(Date.now() + 1000),
        }),
      ).toBe(false);
    });
  });
});
