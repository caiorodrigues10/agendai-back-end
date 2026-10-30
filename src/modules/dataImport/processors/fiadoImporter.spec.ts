import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppTx } from "@/libs/prismaClient";

const {
  salonClientFindFirst,
  fiadoFindMany,
  fiadoCreate,
  fiadoUpdate,
  fiadoPaymentCreate,
  txMock,
} = vi.hoisted(() => {
  const salonClientFindFirst = vi.fn();
  const fiadoFindMany = vi.fn();
  const fiadoCreate = vi.fn();
  const fiadoUpdate = vi.fn();
  const fiadoPaymentCreate = vi.fn();

  return {
    salonClientFindFirst,
    fiadoFindMany,
    fiadoCreate,
    fiadoUpdate,
    fiadoPaymentCreate,
    txMock: {
      salonClient: { findFirst: salonClientFindFirst },
      fiado: { findMany: fiadoFindMany, create: fiadoCreate, update: fiadoUpdate },
      fiadoPayment: { create: fiadoPaymentCreate },
    },
  };
});

import { importFiadoRow } from "./fiadoImporter";
import type { ImportRowContext } from "./importRowContext";
import type { ImportFieldKey } from "../dataImport.types";

const SHOP = "shop-1";
const tx = txMock as unknown as AppTx;

function contexto(
  headers: string[],
  columnMap: Array<[string, number]>,
  overrides: Partial<ImportRowContext> = {},
): ImportRowContext {
  return {
    headers,
    columnMap: new Map(columnMap as Array<[ImportFieldKey, number]>),
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
    segment: null,
    actingUserId: "user-1",
    batchId: "batch-1",
    ...overrides,
  };
}

const MAPA: Array<[string, number]> = [
  ["customerName", 0],
  ["whatsapp", 1],
  ["fiadoDescription", 2],
  ["originalAmount", 3],
  ["paidAmount", 4],
  ["dueDate", 5],
];

const CABECALHO = ["Cliente", "WhatsApp", "Descrição", "Valor", "Pago", "Vencimento"];

describe("importação de fiado", () => {
  beforeEach(() => {
    salonClientFindFirst.mockReset().mockResolvedValue(null);
    fiadoFindMany.mockReset().mockResolvedValue([]);
    fiadoCreate.mockReset().mockResolvedValue({ id: "fiado-1" });
    fiadoUpdate.mockReset().mockResolvedValue({ id: "fiado-1" });
    fiadoPaymentCreate.mockReset().mockResolvedValue({ id: "pay-1" });
  });

  it("cria a dívida com origem IMPORT (não entra no primeiro ciclo de cobrança)", async () => {
    const result = await importFiadoRow(
      tx,
      SHOP,
      {
        Cliente: "Maria",
        WhatsApp: "11987654321",
        Descrição: "Corte + shampoo",
        Valor: "119,90",
        Pago: "0,00",
        Vencimento: "15/11/2026",
      },
      contexto(CABECALHO, MAPA),
    );

    expect(result.status).toBe("IMPORTED");
    expect(result.entityType).toBe("FIADO");
    expect(fiadoCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          barbershopId: SHOP,
          customerName: "Maria",
          whatsapp: "11987654321",
          originalAmount: 119.9,
          paidAmount: 0,
          status: "PENDING",
          origin: "IMPORT",
          createdById: "user-1",
          dueDate: new Date("2026-11-15T00:00:00.000Z"),
        }),
      }),
    );
  });

  it("não cria cliente novo: a dívida fica sem vínculo quando o telefone não bate", async () => {
    const result = await importFiadoRow(
      tx,
      SHOP,
      {
        Cliente: "Maria",
        WhatsApp: "11987654321",
        Descrição: "Corte",
        Valor: "80,00",
        Pago: "0,00",
        Vencimento: "",
      },
      contexto(CABECALHO, MAPA),
    );

    expect(result.status).toBe("IMPORTED");
    expect(fiadoCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ clientId: null }),
      }),
    );
    expect(result.warnings?.some((warning) => /sem vínculo/i.test(warning))).toBe(true);
  });

  it("vincula ao cliente do CRM quando o telefone bate", async () => {
    salonClientFindFirst.mockResolvedValue({ id: "client-1", name: "Maria" });

    await importFiadoRow(
      tx,
      SHOP,
      {
        Cliente: "Maria",
        WhatsApp: "11987654321",
        Descrição: "Corte",
        Valor: "80,00",
        Pago: "0,00",
        Vencimento: "",
      },
      contexto(CABECALHO, MAPA),
    );

    expect(fiadoCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ clientId: "client-1" }),
      }),
    );
  });

  it("registra o valor já pago como pagamento de forma 'other' (sem caixa)", async () => {
    const result = await importFiadoRow(
      tx,
      SHOP,
      {
        Cliente: "Maria",
        WhatsApp: "11987654321",
        Descrição: "Corte",
        Valor: "80,00",
        Pago: "40,00",
        Vencimento: "",
      },
      contexto(CABECALHO, MAPA),
    );

    expect(fiadoPaymentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fiadoId: "fiado-1",
          amount: 40,
          paymentMethod: "other",
        }),
      }),
    );
    expect(fiadoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ paidAmount: 40, status: "PARTIAL" }),
      }),
    );
    expect(result.warnings?.some((warning) => /não entrou no caixa/i.test(warning))).toBe(true);
  });

  it("ignora dívida duplicada (mesmo cliente, descrição, valor e vencimento)", async () => {
    fiadoFindMany.mockResolvedValue([
      {
        id: "fiado-9",
        customerName: "Maria",
        description: "Corte",
        originalAmount: 80,
        dueDate: null,
      },
    ]);

    const result = await importFiadoRow(
      tx,
      SHOP,
      {
        Cliente: "Maria",
        WhatsApp: "11987654321",
        Descrição: "Corte",
        Valor: "80,00",
        Pago: "0,00",
        Vencimento: "",
      },
      contexto(CABECALHO, MAPA),
    );

    expect(result.status).toBe("SKIPPED");
    expect(fiadoCreate).not.toHaveBeenCalled();
  });

  it("rejeita valor já pago maior que a dívida", async () => {
    const result = await importFiadoRow(
      tx,
      SHOP,
      {
        Cliente: "Maria",
        WhatsApp: "11987654321",
        Descrição: "Corte",
        Valor: "80,00",
        Pago: "100,00",
        Vencimento: "",
      },
      contexto(CABECALHO, MAPA),
    );

    expect(result.status).toBe("FAILED");
    expect(result.field).toBe("paidAmount");
  });
});
