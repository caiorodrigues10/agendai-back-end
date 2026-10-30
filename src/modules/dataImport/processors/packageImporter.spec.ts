import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppTx } from "@/libs/prismaClient";

const {
  serviceFindMany,
  servicePackageFindFirst,
  servicePackageFindMany,
  servicePackageCreate,
  salonClientFindFirst,
  salonClientCreate,
  clientPackageCreate,
  txMock,
} = vi.hoisted(() => {
  const serviceFindMany = vi.fn();
  const servicePackageFindFirst = vi.fn();
  const servicePackageFindMany = vi.fn();
  const servicePackageCreate = vi.fn();
  const salonClientFindFirst = vi.fn();
  const salonClientCreate = vi.fn();
  const clientPackageCreate = vi.fn();

  return {
    serviceFindMany,
    servicePackageFindFirst,
    servicePackageFindMany,
    servicePackageCreate,
    salonClientFindFirst,
    salonClientCreate,
    clientPackageCreate,
    txMock: {
      service: { findMany: serviceFindMany },
      servicePackage: {
        findFirst: servicePackageFindFirst,
        findMany: servicePackageFindMany,
        create: servicePackageCreate,
      },
      salonClient: { findFirst: salonClientFindFirst, create: salonClientCreate },
      clientPackage: { create: clientPackageCreate },
    },
  };
});

import { importClientPackageRow, importServicePackageRow } from "./packageImporter";
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

describe("catálogo de pacotes", () => {
  beforeEach(() => {
    serviceFindMany.mockReset().mockResolvedValue([{ id: "svc-1", name: "Corte de cabelo" }]);
    servicePackageFindFirst.mockReset().mockResolvedValue(null);
    servicePackageFindMany.mockReset().mockResolvedValue([]);
    servicePackageCreate.mockReset().mockResolvedValue({ id: "pkg-1" });
  });

  it("cria o pacote do catálogo", async () => {
    const result = await importServicePackageRow(
      tx,
      SHOP,
      { Pacote: "Pacote 5 Cortes", Serviço: "Corte de cabelo", Sessões: "5", Preço: "350,00", Validade: "90" },
      contexto(
        ["Pacote", "Serviço", "Sessões", "Preço", "Validade"],
        [
          ["packageName", 0],
          ["serviceName", 1],
          ["sessionCount", 2],
          ["packagePrice", 3],
          ["validityDays", 4],
        ],
      ),
    );

    expect(result.status).toBe("IMPORTED");
    expect(result.entityType).toBe("SERVICE_PACKAGE");
    expect(servicePackageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          barbershopId: SHOP,
          serviceId: "svc-1",
          name: "Pacote 5 Cortes",
          sessionCount: 5,
          price: 350,
          validityDays: 90,
        }),
      }),
    );
  });

  it("ignora pacote repetido (mesmo nome e serviço)", async () => {
    servicePackageFindFirst.mockResolvedValue({ id: "pkg-9" });

    const result = await importServicePackageRow(
      tx,
      SHOP,
      { Pacote: "Pacote 5 Cortes", Serviço: "Corte de cabelo", Sessões: "5", Preço: "350,00" },
      contexto(
        ["Pacote", "Serviço", "Sessões", "Preço"],
        [
          ["packageName", 0],
          ["serviceName", 1],
          ["sessionCount", 2],
          ["packagePrice", 3],
        ],
      ),
    );

    expect(result.status).toBe("SKIPPED");
    expect(servicePackageCreate).not.toHaveBeenCalled();
  });

  it("exige que o serviço já exista no catálogo", async () => {
    serviceFindMany.mockResolvedValue([]);

    const result = await importServicePackageRow(
      tx,
      SHOP,
      { Pacote: "Pacote 5 Cortes", Serviço: "Inexistente", Sessões: "5", Preço: "350,00" },
      contexto(
        ["Pacote", "Serviço", "Sessões", "Preço"],
        [
          ["packageName", 0],
          ["serviceName", 1],
          ["sessionCount", 2],
          ["packagePrice", 3],
        ],
      ),
    );

    expect(result.status).toBe("FAILED");
    expect(result.field).toBe("serviceName");
  });
});

describe("saldo de pacotes dos clientes", () => {
  beforeEach(() => {
    servicePackageFindMany.mockReset().mockResolvedValue([
      { id: "pkg-1", name: "Pacote 5 Cortes", serviceId: "svc-1" },
    ]);
    salonClientFindFirst.mockReset().mockResolvedValue(null);
    salonClientCreate.mockReset().mockResolvedValue({ id: "client-1" });
    clientPackageCreate.mockReset().mockResolvedValue({ id: "cpkg-1" });
  });

  it("cria o cliente quando o telefone ainda não existe", async () => {
    const result = await importClientPackageRow(
      tx,
      SHOP,
      {
        Cliente: "Maria",
        WhatsApp: "11987654321",
        Pacote: "Pacote 5 Cortes",
        Total: "5",
        Saldo: "4",
        Pago: "350,00",
      },
      contexto(
        ["Cliente", "WhatsApp", "Pacote", "Total", "Saldo", "Pago"],
        [
          ["clientName", 0],
          ["clientWhatsapp", 1],
          ["packageName", 2],
          ["totalSessions", 3],
          ["remainingSessions", 4],
          ["pricePaid", 5],
        ],
      ),
    );

    expect(result.status).toBe("IMPORTED");
    expect(result.entityType).toBe("CLIENT_PACKAGE");
    expect(salonClientCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          barbershopId: SHOP,
          name: "Maria",
          whatsapp: "11987654321",
          marketingOptIn: false,
        }),
      }),
    );
    expect(result.createdClientId).toBe("client-1");
    expect(clientPackageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clientId: "client-1",
          packageId: "pkg-1",
          totalSessions: 5,
          remainingSessions: 4,
          pricePaid: 350,
          status: "ACTIVE",
        }),
      }),
    );
  });

  it("rejeita saldo maior que o total de sessões", async () => {
    const result = await importClientPackageRow(
      tx,
      SHOP,
      {
        WhatsApp: "11987654321",
        Pacote: "Pacote 5 Cortes",
        Total: "5",
        Saldo: "7",
      },
      contexto(
        ["WhatsApp", "Pacote", "Total", "Saldo"],
        [
          ["clientWhatsapp", 0],
          ["packageName", 1],
          ["totalSessions", 2],
          ["remainingSessions", 3],
        ],
      ),
    );

    expect(result.status).toBe("FAILED");
    expect(result.field).toBe("remainingSessions");
  });

  it("exige que o pacote do catálogo exista", async () => {
    servicePackageFindMany.mockResolvedValue([]);

    const result = await importClientPackageRow(
      tx,
      SHOP,
      { WhatsApp: "11987654321", Pacote: "Inexistente", Total: "5", Saldo: "5" },
      contexto(
        ["WhatsApp", "Pacote", "Total", "Saldo"],
        [
          ["clientWhatsapp", 0],
          ["packageName", 1],
          ["totalSessions", 2],
          ["remainingSessions", 3],
        ],
      ),
    );

    expect(result.status).toBe("FAILED");
    expect(result.field).toBe("packageName");
  });
});
