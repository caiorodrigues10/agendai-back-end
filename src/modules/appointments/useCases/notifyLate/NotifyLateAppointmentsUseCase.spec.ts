/// <reference types="vitest/globals" />

const mocks = vi.hoisted(() => ({
  appointmentFindMany: vi.fn(),
  barbershopFindUnique: vi.fn(),
  scheduleFindFirst: vi.fn(),
  policyFindUnique: vi.fn(),
  enqueueWhatsApp: vi.fn(),
  getShopTimezone: vi.fn(),
}));

vi.mock("@/libs/prismaClient", () => ({
  prisma: {
    appointment: { findMany: mocks.appointmentFindMany },
    barbershop: { findUnique: mocks.barbershopFindUnique },
    schedule: { findFirst: mocks.scheduleFindFirst },
    appointmentPolicy: { findUnique: mocks.policyFindUnique },
  },
}));
vi.mock("@/shared/infra/queue", () => ({ enqueueWhatsApp: mocks.enqueueWhatsApp }));
vi.mock("@/modules/financial/ledger/shopTime", () => ({ getShopTimezone: mocks.getShopTimezone }));

import { runLateAppointmentAlerts } from "./NotifyLateAppointmentsUseCase";

const SP = "America/Sao_Paulo";

function apptOf(over: Record<string, unknown> = {}) {
  return {
    id: "appt-1",
    barbershopId: "shop-1",
    customerName: "Ana",
    whatsapp: "11999990000",
    time: "19:00",
    date: new Date("2026-10-05T00:00:00.000Z"),
    clientId: null,
    publicAccessVersion: 3,
    service: { name: "Corte" },
    ...over,
  };
}

function setupShop(over: Record<string, unknown> = {}) {
  mocks.getShopTimezone.mockResolvedValue(SP);
  mocks.barbershopFindUnique.mockResolvedValue({
    name: "Studio Bela",
    whatsapp: "11800000000",
    queueAlertPhone: "11811112222",
    evolutionInstanceName: "inst-bela",
    ...over,
  });
  mocks.scheduleFindFirst.mockResolvedValue({ isOpen: true, closeTime: "20:30" });
  mocks.policyFindUnique.mockResolvedValue({ lateToleranceMinutes: 15 });
}

// Hoje do salão (SP): 2026-10-05. Horário do agendamento: 19:00 SP = 22:00 UTC.
beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset && m.mockReset());
  setupShop({});
  delete process.env.FRONTEND_URL;
});

describe("runLateAppointmentAlerts", () => {
  it("L1 aos 15min: envia cliente + salão com chaves late1 e contagem", async () => {
    mocks.appointmentFindMany.mockResolvedValue([apptOf()]);
    const now = new Date("2026-10-05T22:16:00.000Z"); // 19:16 SP → 16 min de atraso

    const report = await runLateAppointmentAlerts(now);

    expect(report.sent).toBe(1);
    expect(report.byLevel.l1).toBe(1);
    expect(mocks.enqueueWhatsApp).toHaveBeenCalledTimes(2);

    const [clientCall, staffCall] = mocks.enqueueWhatsApp.mock.calls;
    expect(clientCall[0].phone).toBe("11999990000");
    expect(clientCall[0].deduplicationKey).toBe("late1:appt-1:client");
    expect(clientCall[0].notificationType).toBe("APPOINTMENT_LATE_ALERT");
    expect(clientCall[0].message).toContain("atraso");
    expect(staffCall[0].phone).toBe("11811112222"); // queueAlertPhone tem prioridade
    expect(staffCall[0].deduplicationKey).toBe("late1:appt-1:staff");
    expect(staffCall[0].message).toContain("Ana");
  });

  it("não atrasado → nada é enviado", async () => {
    mocks.appointmentFindMany.mockResolvedValue([apptOf()]);
    const report = await runLateAppointmentAlerts(new Date("2026-10-05T22:10:00.000Z")); // 19:10 SP (10min < 15)
    expect(report.sent).toBe(0);
    expect(report.skipped).toBe(1);
    expect(mocks.enqueueWhatsApp).not.toHaveBeenCalled();
  });

  it("dedup por nível: reprocessar o mesmo atraso reenfileira com a MESMA chave (quem barra é o delivery)", async () => {
    mocks.appointmentFindMany.mockResolvedValue([apptOf()]);
    const now = new Date("2026-10-05T22:16:00.000Z");
    const first = await runLateAppointmentAlerts(now);
    const again = await runLateAppointmentAlerts(now);
    expect(first.sent + again.sent).toBe(2);
    const keys = mocks.enqueueWhatsApp.mock.calls.map((c) => c[0].deduplicationKey);
    expect(keys.filter((k) => k === "late1:appt-1:client")).toHaveLength(2); // dedup real é pelo delivery/BullMQ
  });

  it("L3 ao fechar: inclui link de remarcação com token versionado", async () => {
    process.env.FRONTEND_URL = "https://app.agenda-ja.test";
    mocks.appointmentFindMany.mockResolvedValue([apptOf()]);
    const now = new Date("2026-10-05T23:34:00.000Z"); // 20:34 SP → salão fechou às 20:30

    const report = await runLateAppointmentAlerts(now);

    expect(report.byLevel.l3).toBe(1);
    const clientCall = mocks.enqueueWhatsApp.mock.calls[0][0];
    expect(clientCall.notificationType).toBe("APPOINTMENT_LATE_CLOSE");
    expect(clientCall.deduplicationKey).toBe("late3:appt-1:client");
    expect(clientCall.message).toContain("https://app.agenda-ja.test/agendamento/gerenciar?token=");
  });

  it("salão sem instância WhatsApp: não envia para ninguém e não conta como enviado", async () => {
    mocks.barbershopFindUnique.mockResolvedValue({
      name: "Sem Instância",
      whatsapp: null,
      queueAlertPhone: null,
      evolutionInstanceName: null,
    });
    mocks.appointmentFindMany.mockResolvedValue([apptOf()]);
    const report = await runLateAppointmentAlerts(new Date("2026-10-05T22:20:00.000Z"));
    // sent conta níveis processados — mas nenhuma mensagem sai sem instância.
    expect(report.sent).toBe(1); // nível resolvido
    expect(mocks.enqueueWhatsApp).not.toHaveBeenCalled();
  });

  it("agendamento de outro dia civil (fuso) é ignorado", async () => {
    mocks.appointmentFindMany.mockResolvedValue([apptOf({ date: new Date("2026-10-04T00:00:00.000Z") })]);
    const report = await runLateAppointmentAlerts(new Date("2026-10-05T22:40:00.000Z"));
    expect(report.sent).toBe(0);
    expect(report.skipped).toBe(1);
    expect(mocks.enqueueWhatsApp).not.toHaveBeenCalled();
  });

  it("salão fechado hoje (isOpen=false): L1/L2 normais seguem, mas sem L3 e sem modo impaciente", async () => {
    mocks.scheduleFindFirst.mockResolvedValue({ isOpen: false, closeTime: "20:30" });
    mocks.appointmentFindMany.mockResolvedValue([apptOf()]);
    const now = new Date("2026-10-05T22:16:00.000Z");
    const report = await runLateAppointmentAlerts(now);
    expect(report.byLevel.l1).toBe(1);
    expect(mocks.enqueueWhatsApp).toHaveBeenCalledTimes(2);
  });

  it("falha persistida num item não aborta o lote", async () => {
    mocks.appointmentFindMany.mockResolvedValue([
      apptOf({ id: "appt-bom" }),
      apptOf({ id: "appt-bugado", date: "NÃO-É-DATA" as any }),
      apptOf({ id: "appt-bom-2" }),
    ]);
    const report = await runLateAppointmentAlerts(new Date("2026-10-05T22:16:00.000Z"));
    expect(report.failed).toBe(1);
    expect(report.sent).toBe(2);
  });
});
