import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppTx } from "@/libs/prismaClient";
import { importAppointmentRow } from "./appointmentImporter";
import type { ImportRowContext } from "./importRowContext";

const {
  serviceFindFirst,
  salonClientFindFirst,
  salonClientCreate,
  userFindMany,
  appointmentFindFirst,
  appointmentCreate,
  clientCaseFindFirst,
  clientCaseCreate,
} = vi.hoisted(() => ({
  serviceFindFirst: vi.fn(),
  salonClientFindFirst: vi.fn(),
  salonClientCreate: vi.fn(),
  userFindMany: vi.fn(),
  appointmentFindFirst: vi.fn(),
  appointmentCreate: vi.fn(),
  clientCaseFindFirst: vi.fn(),
  clientCaseCreate: vi.fn(),
}));

vi.mock("@/libs/prismaClient", () => ({ prisma: {} }));

const tx = {
  service: { findFirst: serviceFindFirst },
  salonClient: { findFirst: salonClientFindFirst, create: salonClientCreate },
  user: { findMany: userFindMany },
  appointment: { findFirst: appointmentFindFirst, create: appointmentCreate },
  clientCase: { findFirst: clientCaseFindFirst, create: clientCaseCreate },
} as unknown as AppTx;

const SHOP = "shop-1";

function contexto(overrides: Partial<ImportRowContext> = {}): ImportRowContext {
  return {
    headers: ["Data", "Hora", "Cliente", "WhatsApp", "Serviço", "Profissional", "Situação", "Valor"],
    columnMap: new Map([
      ["date", 0],
      ["time", 1],
      ["clientName", 2],
      ["clientWhatsapp", 3],
      ["serviceName", 4],
      ["staffName", 5],
      ["status", 6],
      ["finalPrice", 7],
    ]),
    options: {
      updateExisting: true,
      countFinancialValues: false,
      sendReviewInvitations: false,
      includeCase: false,
    },
    segment: null,
    ...overrides,
  };
}

const LINHA = {
  Data: "05/11/2026",
  Hora: "14:30",
  Cliente: "Ana",
  WhatsApp: "11987654321",
  Serviço: "Corte",
  Profissional: "João",
  Situação: "Confirmado",
  Valor: "80,00",
};

describe("importAppointmentRow", () => {
  beforeEach(() => {
    serviceFindFirst.mockReset().mockResolvedValue({ id: "service-1" });
    salonClientFindFirst.mockReset().mockResolvedValue(null);
    salonClientCreate.mockReset().mockResolvedValue({ id: "client-1" });
    userFindMany.mockReset().mockResolvedValue([]);
    appointmentFindFirst.mockReset().mockResolvedValue(null);
    appointmentCreate.mockReset().mockResolvedValue({ id: "appt-1" });
    clientCaseFindFirst.mockReset().mockResolvedValue(null);
    clientCaseCreate.mockReset().mockResolvedValue({ id: "case-1" });
  });

  it("cria o agendamento com origem IMPORT e sem valor no histórico financeiro", async () => {
    const result = await importAppointmentRow(tx, SHOP, LINHA, contexto());

    expect(result.status).toBe("IMPORTED");
    expect(appointmentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          barbershopId: SHOP,
          source: "IMPORT",
          status: "CONFIRMED",
          finalPrice: null,
          completedAt: null,
        }),
      }),
    );
  });

  it("grava valor e conclusão quando o dono liga a contabilidade financeira", async () => {
    await importAppointmentRow(
      tx,
      SHOP,
      { ...LINHA, Situação: "Concluído" },
      contexto({
        options: {
          updateExisting: true,
          countFinancialValues: true,
          sendReviewInvitations: false,
          includeCase: false,
        },
      }),
    );

    const data = appointmentCreate.mock.calls[0][0].data;
    expect(data.status).toBe("COMPLETED");
    expect(data.finalPrice).toBe(80);
    expect(data.completedAt).toBeInstanceOf(Date);
  });

  it("rejeita agendamento sem serviço no catálogo", async () => {
    serviceFindFirst.mockResolvedValue(null);

    const result = await importAppointmentRow(tx, SHOP, LINHA, contexto());

    expect(result.status).toBe("FAILED");
    expect(result.message).toMatch(/não existe no catálogo/i);
    expect(appointmentCreate).not.toHaveBeenCalled();
  });

  it("rejeita data inválida", async () => {
    const result = await importAppointmentRow(tx, SHOP, { ...LINHA, Data: "31/02/2026" }, contexto());

    expect(result.status).toBe("FAILED");
    expect(result.message).toMatch(/data/i);
  });

  it("rejeita hora inválida", async () => {
    const result = await importAppointmentRow(tx, SHOP, { ...LINHA, Hora: "99:99" }, contexto());

    expect(result.status).toBe("FAILED");
    expect(result.message).toMatch(/hora/i);
  });

  it("cria o cliente quando o telefone ainda não existe", async () => {
    const result = await importAppointmentRow(tx, SHOP, LINHA, contexto());

    expect(result.createdClientId).toBe("client-1");
    expect(salonClientCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ marketingOptIn: false, normalizedWhatsapp: "11987654321" }),
      }),
    );
  });

  it("reaproveita o cliente existente pelo telefone", async () => {
    salonClientFindFirst.mockResolvedValue({ id: "client-9" });

    const result = await importAppointmentRow(tx, SHOP, LINHA, contexto());

    expect(result.createdClientId).toBeNull();
    expect(salonClientCreate).not.toHaveBeenCalled();
    expect(appointmentCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ clientId: "client-9" }) }),
    );
  });

  it("não inventa profissional quando o nome é ambíguo", async () => {
    userFindMany.mockResolvedValue([
      { id: "u1", name: "João Silva" },
      { id: "u2", name: "João Souza" },
    ]);

    await importAppointmentRow(tx, SHOP, LINHA, contexto());

    const data = appointmentCreate.mock.calls[0][0].data;
    expect(data.staffId).toBeNull();
  });

  it("associa o profissional quando o nome é único", async () => {
    userFindMany.mockResolvedValue([{ id: "u1", name: "João" }]);

    await importAppointmentRow(tx, SHOP, LINHA, contexto());

    const data = appointmentCreate.mock.calls[0][0].data;
    expect(data.staffId).toBe("u1");
  });

  it("não cria caso quando o dono não mapeou a coluna", async () => {
    await importAppointmentRow(tx, SHOP, LINHA, contexto());

    expect(clientCaseCreate).not.toHaveBeenCalled();
    const data = appointmentCreate.mock.calls[0][0].data;
    expect(data.caseId).toBeNull();
  });

  it("cria o caso sem compartilhar com o cliente quando o dono pede", async () => {    const ctx = contexto({
      headers: ["Data", "Hora", "Cliente", "WhatsApp", "Serviço", "Caso", "Área"],
      columnMap: new Map([
        ["date", 0],
        ["time", 1],
        ["clientName", 2],
        ["clientWhatsapp", 3],
        ["serviceName", 4],
        ["caseName", 5],
        ["practiceArea", 6],
      ]),
      options: {
        updateExisting: true,
        countFinancialValues: false,
        sendReviewInvitations: false,
        includeCase: true,
      },
    });

    const result = await importAppointmentRow(
      tx,
      SHOP,
      { ...LINHA, Caso: "Ação de cobrança", Área: "Cível" },
      ctx,
    );

    expect(result.createdCaseId).toBe("case-1");
    expect(clientCaseCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ nickname: "Ação de cobrança", shareWithClient: false }),
      }),
    );
    const data = appointmentCreate.mock.calls[0][0].data;
    expect(data.caseId).toBe("case-1");
    expect(data.caseName).toBe("Ação de cobrança");
    expect(data.practiceArea).toBe("Cível");
  });

  it("não duplica agendamento quando o mesmo horário já existe", async () => {
    appointmentFindFirst.mockResolvedValue({ id: "appt-9" });

    const result = await importAppointmentRow(tx, SHOP, LINHA, contexto());

    expect(result.status).toBe("SKIPPED");
    expect(result.entityId).toBe("appt-9");
    expect(appointmentCreate).not.toHaveBeenCalled();
  });

  it("procura duplicata pelo cliente do CRM quando há telefone", async () => {
    await importAppointmentRow(tx, SHOP, LINHA, contexto());

    expect(appointmentFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          serviceId: "service-1",
          time: "14:30",
          clientId: "client-1",
        }),
      }),
    );
  });
});
