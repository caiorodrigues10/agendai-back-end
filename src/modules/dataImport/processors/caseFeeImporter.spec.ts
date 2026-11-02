import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppTx } from "@/libs/prismaClient";
import {
  importCaseFeeRow,
  feeInstallmentsWarning,
  parseFeeStatus,
} from "./caseFeeImporter";
import type { ImportRowContext } from "./importRowContext";

const { salonClientFindFirst, salonClientCreate, clientCaseFindFirst, caseSuccessFeeCreate } =
  vi.hoisted(() => ({
    salonClientFindFirst: vi.fn(),
    salonClientCreate: vi.fn(),
    clientCaseFindFirst: vi.fn(),
    caseSuccessFeeCreate: vi.fn(),
  }));

vi.mock("@/libs/prismaClient", () => ({ prisma: {} }));

const tx = {
  salonClient: { findFirst: salonClientFindFirst, create: salonClientCreate },
  clientCase: { findFirst: clientCaseFindFirst },
  caseSuccessFee: { create: caseSuccessFeeCreate },
} as unknown as AppTx;

const SHOP = "shop-1";

function contexto(): ImportRowContext {
  return {
    headers: ["Processo", "Percentual", "Situação", "Vencimento", "Parcelas", "Observações", "Caso", "WhatsApp"],
    columnMap: new Map([
      ["caseNumber", 0],
      ["percent", 1],
      ["feeStatus", 2],
      ["feeDueDate", 3],
      ["feeInstallments", 4],
      ["feeNotes", 5],
      ["caseName", 6],
      ["clientWhatsapp", 7],
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
  Processo: "1024127-78.2020.8.26.0100",
  Percentual: "20",
  Situação: "Pendente",
  Vencimento: "15/11/2026",
  Parcelas: "1",
  Observações: "Honorário de êxito",
};

describe("importCaseFeeRow", () => {
  beforeEach(() => {
    salonClientFindFirst.mockReset().mockResolvedValue(null);
    salonClientCreate.mockReset().mockResolvedValue({ id: "client-1" });
    clientCaseFindFirst.mockReset().mockResolvedValue({ id: "case-1", clientId: "client-1" });
    caseSuccessFeeCreate.mockReset().mockResolvedValue({ id: "fee-1" });
  });

  it("importa o honorário pelo número do processo", async () => {
    const result = await importCaseFeeRow(tx, SHOP, LINHA, contexto());

    expect(result.status).toBe("IMPORTED");
    expect(result.entityType).toBe("CASE_FEE");
    expect(caseSuccessFeeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          barbershopId: SHOP,
          caseId: "case-1",
          percent: 20,
          installments: 1,
          status: "PENDING",
        }),
      }),
    );
  });

  it("não duplica parcelas: importação com mais de 1 parcela vira 1 com aviso", async () => {
    const result = await importCaseFeeRow(
      tx,
      SHOP,
      { ...LINHA, Parcelas: "3" },
      contexto(),
    );

    expect(result.status).toBe("IMPORTED");
    expect(result.warnings?.join(" ")).toMatch(/não são aceitas na importação/);
    expect(caseSuccessFeeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ installments: 1 }),
      }),
    );
  });

  it("status 'Pago' é gravado como PAID", async () => {
    const result = await importCaseFeeRow(
      tx,
      SHOP,
      { ...LINHA, Situação: "Pago" },
      contexto(),
    );

    expect(result.status).toBe("IMPORTED");
    expect(caseSuccessFeeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          barbershopId: SHOP,
          caseId: "case-1",
          percent: 20,
          installments: 1,
          status: "PAID",
        }),
      }),
    );
  });

  it("rejeita percentual fora do intervalo", async () => {
    const result = await importCaseFeeRow(
      tx,
      SHOP,
      { ...LINHA, Percentual: "150" },
      contexto(),
    );

    expect(result.status).toBe("FAILED");
    expect(result.field).toBe("percent");
    expect(caseSuccessFeeCreate).not.toHaveBeenCalled();
  });

  it("traduz situação desconhecida para PENDING com aviso", () => {
    expect(parseFeeStatus("Pendente")).toEqual({ value: "PENDING" });
    expect(parseFeeStatus("Faturado")).toEqual({ value: "INVOICED" });
    expect(parseFeeStatus("Pago")).toEqual({ value: "PAID" });
    expect(parseFeeStatus("Cancelado")).toEqual({ value: "CANCELED" });
    expect(parseFeeStatus("Desconhecida")).toEqual({
      value: "PENDING",
      warning: expect.stringMatching(/não reconhecida/i),
    });
  });

  it("aceita 1 parcela sem aviso", () => {
    expect(feeInstallmentsWarning("1")).toEqual({ value: 1 });
  });

  it("rejeita mais de 1 parcela com aviso", () => {
    expect(feeInstallmentsWarning("5")).toEqual({
      value: 1,
      warning: expect.stringMatching(/não são aceitas na importação/),
    });
  });

  it("rejeita quando o processo não existe", async () => {
    clientCaseFindFirst.mockResolvedValue(null);

    const result = await importCaseFeeRow(tx, SHOP, LINHA, contexto());

    expect(result.status).toBe("FAILED");
    expect(result.field).toBe("caseNumber");
    expect(caseSuccessFeeCreate).not.toHaveBeenCalled();
  });

  it("sem número do processo, usa cliente + apelido", async () => {
    salonClientFindFirst.mockResolvedValue({ id: "client-9", name: "Maria" });
    clientCaseFindFirst.mockResolvedValue({ id: "case-9", clientId: "client-9" });

    const result = await importCaseFeeRow(
      tx,
      SHOP,
      { ...LINHA, Processo: "", Caso: "Ação de cobrança", WhatsApp: "11987654321" },
      contexto(),
    );

    expect(result.status).toBe("IMPORTED");
    expect(result.createdClientId).toBeNull();
    expect(caseSuccessFeeCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ caseId: "case-9" }) }),
    );
  });
});
