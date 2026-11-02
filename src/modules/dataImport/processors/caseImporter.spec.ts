import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppTx } from "@/libs/prismaClient";
import {
  importCaseRow,
  parseCasePriority,
  parseCaseStatus,
} from "./caseImporter";
import type { ImportRowContext } from "./importRowContext";

const { salonClientFindFirst, salonClientCreate, userFindMany, clientCaseFindFirst, clientCaseCreate } =
  vi.hoisted(() => ({
    salonClientFindFirst: vi.fn(),
    salonClientCreate: vi.fn(),
    userFindMany: vi.fn(),
    clientCaseFindFirst: vi.fn(),
    clientCaseCreate: vi.fn(),
  }));

vi.mock("@/libs/prismaClient", () => ({ prisma: {} }));

const tx = {
  salonClient: { findFirst: salonClientFindFirst, create: salonClientCreate },
  user: { findMany: userFindMany },
  clientCase: { findFirst: clientCaseFindFirst, create: clientCaseCreate },
} as unknown as AppTx;

const SHOP = "shop-1";

function contexto(): ImportRowContext {
  return {
    headers: ["Cliente", "WhatsApp", "Caso", "Processo", "Área", "Situação", "Prioridade", "Data", "Advogado"],
    columnMap: new Map([
      ["clientName", 0],
      ["clientWhatsapp", 1],
      ["caseName", 2],
      ["caseNumber", 3],
      ["practiceArea", 4],
      ["caseStatus", 5],
      ["casePriority", 6],
      ["openedAt", 7],
      ["staffName", 8],
    ]),
    options: {
      updateExisting: true,
      countFinancialValues: false,
      sendReviewInvitations: false,
      includeCase: false,
      replaceExistingSchedules: false,
      importTimeOffAsPending: false,
      updateExistingProducts: false,
      createProductCategories: false,
      sendFiadoReminders: false,
    },
    segment: "LAW_FIRM",
    actingUserId: "user-1",
    batchId: "batch-1",
  };
}

const LINHA = {
  Cliente: "Maria da Silva",
  WhatsApp: "11987654321",
  Caso: "Ação de cobrança",
  Processo: "1024127-78.2020.8.26.0100",
  Área: "Cível",
  Situação: "Em andamento",
  Prioridade: "Alta",
  Data: "01/10/2026",
};

describe("importCaseRow", () => {
  beforeEach(() => {
    salonClientFindFirst.mockReset().mockResolvedValue(null);
    salonClientCreate.mockReset().mockResolvedValue({ id: "client-1" });
    userFindMany.mockReset().mockResolvedValue([]);
    clientCaseFindFirst.mockReset().mockResolvedValue(null);
    clientCaseCreate.mockReset().mockResolvedValue({ id: "case-1" });
  });

  it("importa o processo com cliente novo, sigilo e sem lançamento financeiro", async () => {
    const result = await importCaseRow(tx, SHOP, LINHA, contexto());

    expect(result.status).toBe("IMPORTED");
    expect(result.entityType).toBe("CASE");
    expect(result.createdClientId).toBe("client-1");
    expect(salonClientCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          marketingOptIn: false,
          normalizedWhatsapp: "11987654321",
        }),
      }),
    );
    expect(clientCaseCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          barbershopId: SHOP,
          clientId: "client-1",
          nickname: "Ação de cobrança",
          caseNumber: "1024127-78.2020.8.26.0100",
          status: "ACTIVE",
          priority: "HIGH",
          claimedAmount: null,
          shareWithClient: false,
        }),
      }),
    );
    expect(result.warnings ?? []).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/dígito verificador/i)]),
    );
  });

  it("não duplica processo com o mesmo número CNJ", async () => {
    clientCaseFindFirst.mockResolvedValue({ id: "case-existing" });

    const result = await importCaseRow(tx, SHOP, LINHA, contexto());

    expect(result.status).toBe("SKIPPED");
    expect(result.entityId).toBe("case-existing");
    expect(clientCaseCreate).not.toHaveBeenCalled();
  });

  it("sem número, não duplica o mesmo apelido do cliente", async () => {
    salonClientFindFirst.mockResolvedValue({ id: "client-9", name: "Maria" });
    clientCaseFindFirst.mockResolvedValue({ id: "case-existing" });

    const result = await importCaseRow(
      tx,
      SHOP,
      { ...LINHA, Processo: "" },
      contexto(),
    );

    expect(result.status).toBe("SKIPPED");
    expect(clientCaseFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ clientId: "client-9", nickname: expect.anything() }),
      }),
    );
  });

  it("avisa sobre CNJ inválido e importa assim mesmo", async () => {
    const result = await importCaseRow(
      tx,
      SHOP,
      { ...LINHA, Processo: "1024127-78.2020.8.26.0101" },
      contexto(),
    );

    expect(result.status).toBe("IMPORTED");
    expect(result.warnings?.join(" ")).toMatch(/dígito verificador CNJ/i);
  });

  it("entra sem responsável quando o nome do advogado é ambíguo", async () => {
    userFindMany.mockResolvedValue([
      { id: "u1", name: "Ana Silva" },
      { id: "u2", name: "Ana Souza" },
    ]);

    const result = await importCaseRow(
      tx,
      SHOP,
      { ...LINHA, Data: "01/10/2026", Advogado: "Ana" },
      contexto(),
    );

    expect(result.status).toBe("IMPORTED");
    expect(result.warnings?.join(" ")).toMatch(/sem responsável/i);
    expect(clientCaseCreate.mock.calls[0][0].data.responsibleStaffId).toBeNull();
  });

  it("rejeita data de abertura inválida", async () => {
    const result = await importCaseRow(
      tx,
      SHOP,
      { ...LINHA, Data: "31/02/2026" },
      contexto(),
    );

    expect(result.status).toBe("FAILED");
    expect(result.field).toBe("openedAt");
    expect(clientCaseCreate).not.toHaveBeenCalled();
  });

  it("traduz situação e prioridade desconhecidas para o padrão com aviso", () => {
    expect(parseCaseStatus("Em juízo")).toEqual({ value: "IN_COURT" });
    expect(parseCaseStatus("Fase estranha")).toEqual({
      value: "ACTIVE",
      warning: expect.stringMatching(/não reconhecida/i),
    });
    expect(parseCasePriority("Urgente")).toEqual({ value: "URGENT" });
    expect(parseCasePriority("Depois")).toEqual({
      value: "NORMAL",
      warning: expect.stringMatching(/não reconhecida/i),
    });
  });
});
